import { NextResponse } from 'next/server'
import { findUserById, setUserPhone } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { getCountry, getVerificationAmount, getWithdrawalFee, normalizePhone } from '@/lib/countries'
import { getPaymentLink } from '@/lib/flutterwave'

export const dynamic = 'force-dynamic'

// Withdrawals are fee-gated. We validate the request and stash it as a pending
// "awaiting fee" row, then send the customer to the Flutterwave payment link to
// pay the non-refundable fee. When the fee charge succeeds, the webhook
// (handleSuccessfulCharge) finalizes this withdrawal.
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

  // Pre-check the balance and deposit so the customer isn't charged a fee for a
  // withdrawal that can't go through.
  if (amount > (user.balance ?? 0)) {
    return NextResponse.json({ error: 'insufficient funds' }, { status: 400 })
  }
  if (!user.firstDepositAt) {
    return NextResponse.json({ error: 'make a deposit before withdrawing' }, { status: 400 })
  }

  // Stash the withdrawal as "awaiting fee". The webhook matches the user's next
  // successful payment (>= the fee) and finalizes this row.
  const withdrawalFee = getWithdrawalFee(user.country)
  const reference = `PB-WDR-${userId.slice(0, 8)}-${Date.now()}`
  try {
    await recordPayment({
      userId,
      reference,
      amount: +amount.toFixed(2),
      type: 'withdrawal',
      status: 'pending',
      provider: 'flutterwave',
      currency: user.currency,
      metadata: {
        ...payoutMeta,
        awaitingFee: true,
        fee: withdrawalFee,
        withdrawal: {
          amount: +amount.toFixed(2),
          payoutMeta,
          withdrawalApproved: !!user.withdrawalApproved,
        },
      },
    })
  } catch (e) {
    console.error('[withdraw] awaiting-fee ledger write failed:', e)
    return NextResponse.json({ error: 'could not start the withdrawal' }, { status: 500 })
  }

  return NextResponse.json(
    {
      feeRequired: true,
      withdrawalFee,
      currency: user.currency,
      reference,
      redirectUrl: getPaymentLink(),
      payWithEmail: user.email,
    },
    { status: 402 },
  )
}
