import { NextResponse } from 'next/server'
import {
  isValidWebhookSignature,
  isChargeSuccessful,
  type FlutterwaveWebhookPayload,
} from '@/lib/flutterwave'
import { handleSuccessfulCharge } from '@/lib/flutterwave-credit'

export const dynamic = 'force-dynamic'

// Flutterwave POSTs here on every charge. We verify the `verif-hash` header
// against FLUTTERWAVE_WEBHOOK_SECRET, then credit the matching user (by email)
// for successful charges. Idempotent on the transaction id.
export async function POST(request: Request) {
  if (!isValidWebhookSignature(request.headers.get('verif-hash'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: FlutterwaveWebhookPayload
  try {
    payload = (await request.json()) as FlutterwaveWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const data = payload.data
  if (!data || !isChargeSuccessful(data.status)) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
  }

  const email = data.customer?.email?.trim().toLowerCase()
  const txId = String(data.id ?? data.tx_ref ?? '')
  const amount = Number(data.amount)
  if (!email || !txId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: true, ignored: 'missing-fields' }, { status: 200 })
  }

  try {
    const outcome = await handleSuccessfulCharge({
      txId,
      email,
      amount,
      currency: data.currency ?? '',
    })
    return NextResponse.json({ ok: true, outcome }, { status: 200 })
  } catch (e) {
    console.error('[flutterwave/webhook] failed:', e)
    // 500 so Flutterwave retries — handleSuccessfulCharge is idempotent.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
