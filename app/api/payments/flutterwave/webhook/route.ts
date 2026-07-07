import { NextResponse } from 'next/server'
import { isValidWebhookSignature } from '@/lib/flutterwave'
import { verifyAndCreditFlutterwave } from '@/lib/flutterwave-credit'
import { findPaymentByReference } from '@/lib/payments-store'
import { finalizeWithdrawalFromFee } from '@/lib/flutterwave-withdrawal'
import { finalizeTransfer } from '@/lib/flutterwave-transfers'

export const dynamic = 'force-dynamic'

// Flutterwave calls this when a charge completes — the reliable, browser-
// independent path to crediting. We verify the `verif-hash` header, then run
// the same idempotent verify-by-reference pipeline the client poll uses (so a
// payment is credited exactly once whichever path gets there first).
export async function POST(request: Request) {
  if (!isValidWebhookSignature(request.headers.get('verif-hash'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: {
    event?: string
    data?: { tx_ref?: string; reference?: string; status?: string }
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Payout results (transfer.completed / transfer.failed) settle a queued
  // withdrawal. These carry `data.reference` (our payout ref), not `tx_ref`.
  if ((payload.event ?? '').startsWith('transfer')) {
    const payoutRef = (payload.data?.reference ?? '').trim()
    if (!payoutRef) {
      return NextResponse.json({ ok: true, ignored: 'no-transfer-ref' }, { status: 200 })
    }
    try {
      await finalizeTransfer(payoutRef, payload.data?.status ?? '')
      return NextResponse.json({ ok: true, transfer: payload.data?.status }, { status: 200 })
    } catch (e) {
      console.error('[flutterwave/webhook] transfer settle failed:', e)
      return NextResponse.json({ ok: false }, { status: 500 })
    }
  }

  const reference = (payload.data?.tx_ref ?? '').trim()
  if (!reference) {
    return NextResponse.json({ ok: true, ignored: 'no-tx_ref' }, { status: 200 })
  }

  try {
    const pending = await findPaymentByReference(reference).catch(() => null)
    const isFee = pending?.metadata?.purpose === 'withdrawal-fee'

    const result = await verifyAndCreditFlutterwave(reference, { credit: !isFee })

    if (isFee && pending && result.status === 'success') {
      await finalizeWithdrawalFromFee(pending)
    }

    return NextResponse.json({ ok: true, status: result.status }, { status: 200 })
  } catch (e) {
    console.error('[flutterwave/webhook] failed:', e)
    // 500 so Flutterwave retries — the pipeline is idempotent.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
