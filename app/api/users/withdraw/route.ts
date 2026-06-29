import { NextResponse } from 'next/server'
import { findUserById, recordWithdrawal, setUserPhone } from '@/lib/users-store'
import { recordPayment, findPaymentByReference, listPaymentsForUser } from '@/lib/payments-store'
import { getCountry, getVerificationAmount, getWithdrawalFee, normalizePhone } from '@/lib/countries'

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
    /** Reference of the Paystack withdrawal-fee payment that unlocks this request. */
    feeReference?: string
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

  // Look up the user first so payout validation can match the country.
  const user = await findUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }
  const cfg = getCountry(user.country)

  const network = (body.network ?? '').trim().toLowerCase()
  const validNetworks = new Set(cfg.payoutNetworks.map((n) => n.key))
  if (!validNetworks.has(network)) {
    const labels = cfg.payoutNetworks.map((n) => n.label).join(', ')
    return NextResponse.json(
      { error: `pick a payout option (${labels})` },
      { status: 400 },
    )
  }

  // Mobile-money countries (GH/KE) require a phone; bank countries (NG/ZA)
  // require an account number + bank name. Save whichever the user supplied
  // on the payment metadata so the operator can process the payout.
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
    // Cache the canonical phone on the user for next time.
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

  // Gate withdrawals behind the two-step verification (amount is country-aware).
  const step = user.verificationStep ?? 0
  const verificationAmount = getVerificationAmount(user.country)
  const VERIFICATION_TOTAL = 4
  if (step < VERIFICATION_TOTAL) {
    const remaining = VERIFICATION_TOTAL - step
    const verificationMessage = `Account verification in progress (${step}/${VERIFICATION_TOTAL}). ${remaining} more qualifying deposit${remaining === 1 ? '' : 's'} of ${user.currency} ${verificationAmount} required before withdrawal options unlock.`
    return NextResponse.json(
      {
        error: verificationMessage,
        verificationRequired: true,
        verificationStep: step,
        verificationTotal: VERIFICATION_TOTAL,
        verificationDepositAmount: verificationAmount,
        currency: user.currency,
      },
      { status: 403 },
    )
  }

  // Require a paid, single-use Paystack withdrawal fee before the request is
  // accepted. The fee is non-refundable and is not credited to the wallet.
  const feeReference = (body.feeReference ?? '').trim()
  const withdrawalFee = getWithdrawalFee(user.country)
  if (!feeReference) {
    return NextResponse.json(
      {
        error: `A non-refundable withdrawal fee of ${user.currency} ${withdrawalFee} is required.`,
        feeRequired: true,
        withdrawalFee,
        currency: user.currency,
      },
      { status: 402 },
    )
  }

  const feePayment = await findPaymentByReference(feeReference)
  const feeValid =
    feePayment &&
    feePayment.userId === userId &&
    feePayment.provider === 'paystack' &&
    feePayment.metadata?.purpose === 'withdrawal-fee' &&
    feePayment.status === 'success'
  if (!feeValid) {
    return NextResponse.json(
      { error: 'Withdrawal fee not paid or not verified. Please pay the fee and try again.', feeRequired: true },
      { status: 402 },
    )
  }

  // Single-use: a fee reference can only back one withdrawal request. Reject it
  // if any earlier withdrawal row already consumed it.
  const priorPayments = await listPaymentsForUser(userId).catch(() => [])
  const alreadyConsumed = priorPayments.some(
    (p) => p.type === 'withdrawal' && p.metadata?.feeReference === feeReference,
  )
  if (alreadyConsumed) {
    return NextResponse.json(
      { error: 'This withdrawal fee has already been used. Please pay a new fee to withdraw again.', feeRequired: true },
      { status: 402 },
    )
  }

  // Tie the fee to the withdrawal ledger row so it can't be reused.
  payoutMeta = { ...payoutMeta, feeReference }

  // Even after verification, the admin still has to flip the
  // withdrawal_approved switch. Externally we present this as "we're
  // processing your request" so the player isn't stressed by a lock screen.
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
    return NextResponse.json(
      { message: PROCESSING_MESSAGE, pending: true },
      { status: 202 },
    )
  }

  const result = await recordWithdrawal(userId, +amount.toFixed(2))
  if ('error' in result) {
    if (result.error === 'not-found') {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }
    if (result.error === 'no-deposit') {
      return NextResponse.json(
        { error: 'make a deposit before withdrawing' },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'insufficient funds' }, { status: 400 })
  }

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
