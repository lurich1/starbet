import { NextResponse } from 'next/server'
import { findPaymentByReference, markPaymentResolved } from '@/lib/payments-store'
import { verifyTransaction, fromMinorUnits } from '@/lib/paystack'
import { isCurrencyCode, type CurrencyCode } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface VerifyBody {
  reference?: string
}

// Verifies a withdrawal-fee Paystack transaction. Unlike the deposit verify
// route, this NEVER runs applyDepositCredit — the fee is non-refundable and is
// not added to the user's balance. It only flips the pending payment row to
// 'success' so the withdraw route can consume it.
export async function POST(request: Request) {
  let body: VerifyBody
  try {
    body = (await request.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const reference = (body.reference ?? '').trim()
  if (!reference) {
    return NextResponse.json({ error: 'reference required' }, { status: 400 })
  }

  const pending = await findPaymentByReference(reference)
  if (!pending) {
    return NextResponse.json({ ok: false, status: 'unknown-reference', reference }, { status: 400 })
  }
  if (pending.metadata?.purpose !== 'withdrawal-fee') {
    return NextResponse.json({ ok: false, status: 'wrong-purpose', reference }, { status: 400 })
  }
  if (pending.status === 'success') {
    return NextResponse.json({ ok: true, status: 'already-paid', reference }, { status: 200 })
  }

  let verified
  try {
    verified = await verifyTransaction(reference)
  } catch (e) {
    console.error('[withdrawal-fee/verify] verify failed:', e)
    return NextResponse.json({ ok: false, status: 'verify-failed', reference }, { status: 400 })
  }

  if (verified.status !== 'success') {
    return NextResponse.json({ ok: false, status: verified.status, reference }, { status: 400 })
  }

  const currency: CurrencyCode = isCurrencyCode(verified.currency)
    ? verified.currency
    : (pending.currency as CurrencyCode)
  const major = fromMinorUnits(verified.amount, currency)
  if (Math.abs(major - pending.amount) > 0.01) {
    console.error('[withdrawal-fee/verify] amount mismatch', {
      reference,
      expected: pending.amount,
      paid: major,
    })
    return NextResponse.json({ ok: false, status: 'amount-mismatch', reference }, { status: 400 })
  }

  // Mark the fee paid. No wallet credit. A null return means another caller
  // already resolved it — still a success from the user's point of view.
  await markPaymentResolved(pending.id, 'paystack withdrawal-fee verified')

  return NextResponse.json({ ok: true, status: 'success', reference }, { status: 200 })
}
