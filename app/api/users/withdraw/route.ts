import { NextResponse } from 'next/server'
import { findUserById, setUserPhone } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { getCountry, getVerificationAmount, getWithdrawalFee, normalizePhone } from '@/lib/countries'
import { createCharge, paymentMethodForCountry } from '@/lib/flutterwave'

export const dynamic = 'force-dynamic'

function originFromRequest(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  return { first: parts[0] || 'Customer', last: parts.slice(1).join(' ') || '-' }
}

// Withdrawals are fee-gated. Instead of moving money immediately, this route
// validates the request, then opens a Flutterwave charge for the non-refundable
// withdrawal fee with the full withdrawal request stashed on the payment row.
// Once the customer pays the fee, /api/payments/flutterwave/callback finalizes
// the withdrawal (see finalizeWithdrawalFromFee there).
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
  let momoPhone: string | undefined
  if (cfg.payoutTarget === 'mobile') {
    const phone = normalizePhone(user.country, body.phone ?? '')
    if (!phone) {
      return NextResponse.json(
        { error: `enter a valid ${cfg.name} mobile-money number` },
        { status: 400 },
      )
    }
    momoPhone = phone
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

  // Pre-check the balance so the customer isn't charged a fee for a withdrawal
  // that would bounce (the actual deduction happens after the fee is paid).
  if (amount > (user.balance ?? 0)) {
    return NextResponse.json({ error: 'insufficient funds' }, { status: 400 })
  }
  if (!user.firstDepositAt) {
    return NextResponse.json({ error: 'make a deposit before withdrawing' }, { status: 400 })
  }

  // Open the non-refundable withdrawal fee via Flutterwave. The full withdrawal
  // request rides along on the fee payment row so the callback can finalize it.
  const withdrawalFee = getWithdrawalFee(user.country)
  const feeReference = `PB-WFEE-${userId.slice(0, 8)}-${Date.now()}`
  const returnPath = '/me'
  const redirectUrl = `${originFromRequest(request)}/api/payments/flutterwave/callback?returnPath=${encodeURIComponent(returnPath)}&ref=${encodeURIComponent(feeReference)}`
  const name = splitName(user.name)

  try {
    const charge = await createCharge({
      reference: feeReference,
      amount: withdrawalFee,
      currency: user.currency,
      redirectUrl,
      customer: { email: user.email, firstName: name.first, lastName: name.last, phone: momoPhone },
      paymentMethod: paymentMethodForCountry(user.country, { phone: momoPhone, network }),
      meta: { userId, purpose: 'withdrawal-fee' },
    })

    await recordPayment({
      userId,
      reference: feeReference,
      amount: withdrawalFee,
      type: 'deposit',
      status: 'pending',
      provider: 'flutterwave',
      currency: user.currency,
      metadata: {
        purpose: 'withdrawal-fee',
        flwChargeId: charge.id,
        returnPath,
        // The withdrawal to execute once the fee clears.
        withdrawal: {
          amount: +amount.toFixed(2),
          payoutMeta,
          withdrawalApproved: !!user.withdrawalApproved,
        },
      },
    }).catch((e) => console.error('[withdraw] fee ledger write failed:', e))

    return NextResponse.json(
      {
        feeRequired: true,
        withdrawalFee,
        currency: user.currency,
        reference: feeReference,
        redirectUrl: charge.next_action?.redirect_url?.url ?? null,
        nextAction: charge.next_action ?? null,
      },
      { status: 402 },
    )
  } catch (e) {
    console.error('[withdraw] fee charge failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'could not start the withdrawal fee payment' },
      { status: 502 },
    )
  }
}
