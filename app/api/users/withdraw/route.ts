import { NextResponse } from 'next/server'
import {
  findUserById,
  recordWithdrawal,
  setUserPhone,
  debitBalance,
  creditBalance,
} from '@/lib/users-store'
import { recordPayment, countWithdrawals } from '@/lib/payments-store'
import {
  getCountry,
  getVerificationSteps,
  getWithdrawalMin,
  getWithdrawalMax,
  getWithdrawalMaxVerified,
  normalizePhone,
} from '@/lib/countries'
import {
  supportsAutoTransfer,
  initiateMobileMoneyTransfer,
} from '@/lib/flutterwave-transfers'
import { reverseCommissionOnWithdrawal } from '@/lib/withdrawal-commission'

export const dynamic = 'force-dynamic'

const PROCESSING_MESSAGE =
  'Your withdrawal request has been received and is being processed. We will notify you shortly.'

export async function POST(request: Request) {
  let body: {
    userId?: string
    amount?: number
    network?: string
    phone?: string
    /** Bank account number for ZA/NG users (and any future bank-payout country). */
    accountNumber?: string
    /** Bank name shown to the operator processing the payout. */
    bankName?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  const amount = Number(body.amount)
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
  }

  const user = await findUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }
  const cfg = getCountry(user.country)

  const network = (body.network ?? '').trim().toLowerCase()
  const validNetworks = new Set(cfg.payoutNetworks.map((n) => n.key))
  if (!validNetworks.has(network)) {
    const labels = cfg.payoutNetworks.map((n) => n.label).join(', ')
    return NextResponse.json({ error: `pick a payout option (${labels})` }, { status: 400 })
  }

  // Mobile-money countries (GH/KE) require a phone; bank countries (NG/ZA)
  // require an account number + bank name.
  let payoutMeta: Record<string, unknown> = { network }
  if (cfg.payoutTarget === 'mobile') {
    const phone = normalizePhone(user.country, body.phone ?? '')
    if (!phone) {
      return NextResponse.json(
        { error: `enter a valid ${cfg.name} mobile-money number` },
        { status: 400 },
      )
    }
    payoutMeta = { ...payoutMeta, phone }
    if (phone !== user.phone) {
      await setUserPhone(userId, phone).catch(() => null)
    }
  } else {
    const accountNumber = (body.accountNumber ?? '').replace(/\s|-/g, '')
    const bankName = (body.bankName ?? '').trim()
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return NextResponse.json(
        { error: 'enter a valid bank account number (digits only)' },
        { status: 400 },
      )
    }
    if (!bankName) {
      return NextResponse.json({ error: 'bank name is required' }, { status: 400 })
    }
    payoutMeta = { ...payoutMeta, accountNumber, bankName }
  }

  // Tiered withdrawal limits by verification status.
  //   Unverified → small band (GH: 1–30). Verified → raised cap (GH: 75,000).
  // A country whose unverified cap is 0 keeps the old hard block: unverified
  // users can't withdraw at all until every verification deposit is done.
  const step = user.verificationStep ?? 0
  const steps = getVerificationSteps(user.country)
  const total = steps.length
  const verified = step >= total
  const minAmount = getWithdrawalMin(user.country)
  const cap = getWithdrawalMax(user.country, verified) // 0 = no cap (verified) / not allowed (unverified)

  // Unverified + no unverified band configured → hard verification block.
  if (!verified && cap === 0) {
    const nextAmount = steps[step]
    const remaining = total - step
    const verificationMessage = `Account verification in progress (${step}/${total}). ${remaining} more qualifying deposit${remaining === 1 ? '' : 's'} required — the next must be at least ${user.currency} ${nextAmount} before withdrawal options unlock.`
    return NextResponse.json(
      {
        error: verificationMessage,
        verificationRequired: true,
        verificationStep: step,
        verificationTotal: total,
        verificationDepositAmount: nextAmount,
        currency: user.currency,
      },
      { status: 403 },
    )
  }

  if (amount < minAmount) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ${user.currency} ${minAmount}.` },
      { status: 400 },
    )
  }

  // Unverified users get exactly ONE withdrawal. After that they must pay for
  // verification (the qualifying deposits) before they can withdraw again.
  // (A failed+refunded payout flips to 'failed' and no longer counts.)
  if (!verified) {
    const priorWithdrawals = await countWithdrawals(userId)
    if (priorWithdrawals >= 1) {
      const remaining = total - step
      const verifyAmount = steps[step] ?? steps[0]
      const raisedCap = getWithdrawalMaxVerified(user.country)
      return NextResponse.json(
        {
          error: `You've already used your one withdrawal for an unverified account. Complete your verification with ${remaining} deposit${remaining === 1 ? '' : 's'} of ${user.currency} ${verifyAmount} to withdraw again (limit up to ${user.currency} ${raisedCap.toLocaleString()} per transaction).`,
          verificationRequired: true,
          verificationStep: step,
          verificationTotal: total,
          verificationDepositAmount: verifyAmount,
          currency: user.currency,
        },
        { status: 403 },
      )
    }
  }

  // Over the cap. If they're unverified, tell them how to raise it.
  if (cap > 0 && amount > cap) {
    if (!verified) {
      const verifyAmount = steps[step] ?? steps[0]
      const remaining = total - step
      const raisedCap = getWithdrawalMaxVerified(user.country)
      return NextResponse.json(
        {
          error: `Your account is not yet verified. You can currently withdraw only ${user.currency} ${minAmount} to ${user.currency} ${cap}. Complete your verification with ${remaining} deposit${remaining === 1 ? '' : 's'} of ${user.currency} ${verifyAmount} to increase your withdrawal limit to up to ${user.currency} ${raisedCap.toLocaleString()} per transaction.`,
          verificationRequired: true,
          verificationStep: step,
          verificationTotal: total,
          verificationDepositAmount: verifyAmount,
          currency: user.currency,
        },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: `Maximum withdrawal is ${user.currency} ${cap.toLocaleString()}.` },
      { status: 400 },
    )
  }

  if (!user.firstDepositAt) {
    return NextResponse.json({ error: 'make a deposit before withdrawing' }, { status: 400 })
  }

  const roundedAmount = +amount.toFixed(2)

  // ---- Mobile-money countries (GH/KE): auto-pay via Flutterwave Transfers ----
  // Reserve the balance up front, queue the payout, and let the
  // `transfer.completed` webhook settle it (or refund on failure).
  if (cfg.payoutTarget === 'mobile' && supportsAutoTransfer(user.country)) {
    const phone = (payoutMeta.phone as string | undefined) ?? ''
    const reference = `PB-WDR-${userId.slice(0, 8)}-${Date.now()}`

    // Debit first so the same balance can't be withdrawn twice while the
    // payout is in flight. Refunded by the webhook if the transfer fails.
    const debit = await debitBalance(userId, roundedAmount)
    if ('error' in debit) {
      if (debit.error === 'not-found') {
        return NextResponse.json({ error: 'user not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'insufficient funds' }, { status: 400 })
    }

    const transfer = await initiateMobileMoneyTransfer({
      reference,
      amount: roundedAmount,
      currency: user.currency,
      country: user.country,
      network,
      phone,
      beneficiaryName: user.name,
      narration: 'Prime Bet withdrawal',
    })

    if (!transfer.ok) {
      // Gateway declined at queue time — give the money straight back and log
      // a failed row so the attempt still shows in the user's history.
      await creditBalance(userId, roundedAmount).catch((e) =>
        console.error('[withdraw] refund after failed transfer init failed:', e),
      )
      await recordPayment({
        userId,
        reference,
        amount: roundedAmount,
        type: 'withdrawal',
        status: 'failed',
        provider: 'flutterwave',
        currency: user.currency,
        metadata: { ...payoutMeta, transferError: transfer.message },
      }).catch((e) => console.error('[withdraw] failed-transfer ledger write failed:', e))

      return NextResponse.json(
        {
          error: 'We could not start your payout. Please try again shortly.',
          // Surfaced so the operator can see exactly why Flutterwave declined
          // (transfers not enabled, insufficient FLW balance, bad code, etc.).
          detail: transfer.message ?? undefined,
        },
        { status: 502 },
      )
    }

    await recordPayment({
      userId,
      reference,
      amount: roundedAmount,
      type: 'withdrawal',
      status: 'pending',
      provider: 'flutterwave',
      currency: user.currency,
      metadata: { ...payoutMeta, flwTransferId: transfer.flwId, flwStatus: transfer.status },
    }).catch((e) => console.error('[withdraw] pending transfer ledger write failed:', e))

    return NextResponse.json(
      {
        message: PROCESSING_MESSAGE,
        pending: true,
        user: {
          id: debit.user.id,
          balance: debit.user.balance ?? 0,
          totalWithdrawn: debit.user.totalWithdrawn ?? 0,
        },
      },
      { status: 202 },
    )
  }

  // ---- Bank countries (NG/ZA): manual admin payout (unchanged) -------------
  // Even after verification, the admin still has to flip the withdrawal_approved
  // switch. Externally we present this as "we're processing your request".
  if (!user.withdrawalApproved) {
    try {
      await recordPayment({
        userId,
        reference: `PB-WDR-${userId.slice(0, 8)}-${Date.now()}`,
        amount,
        type: 'withdrawal',
        status: 'pending',
        provider: 'manual',
        currency: user.currency,
        metadata: payoutMeta,
      })
    } catch (e) {
      console.error('[withdraw] pending payment ledger write failed:', e)
    }
    return NextResponse.json({ message: PROCESSING_MESSAGE, pending: true }, { status: 202 })
  }

  const result = await recordWithdrawal(userId, roundedAmount)
  if ('error' in result) {
    if (result.error === 'not-found') {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }
    if (result.error === 'no-deposit') {
      return NextResponse.json({ error: 'make a deposit before withdrawing' }, { status: 400 })
    }
    return NextResponse.json({ error: 'insufficient funds' }, { status: 400 })
  }

  // Reverse the referrer's commission on the money that left the platform.
  await reverseCommissionOnWithdrawal(userId, roundedAmount, user.currency)

  try {
    await recordPayment({
      userId,
      reference: `PB-WDR-${userId.slice(0, 8)}-${Date.now()}`,
      amount,
      type: 'withdrawal',
      status: 'success',
      provider: 'manual',
      currency: user.currency,
      metadata: payoutMeta,
    })
  } catch (e) {
    console.error('[withdraw] payment ledger write failed:', e)
  }

  return NextResponse.json(
    {
      user: {
        id: result.user.id,
        name: result.user.name,
        country: result.user.country,
        currency: result.user.currency,
        totalDeposited: result.user.totalDeposited,
        totalWithdrawn: result.user.totalWithdrawn ?? 0,
        balance: result.user.balance ?? 0,
        verificationStep: result.user.verificationStep ?? 0,
      },
    },
    { status: 201 },
  )
}
