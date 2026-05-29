import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  findPaymentByReference,
  markPaymentResolved,
} from '@/lib/payments-store'
import { applyDepositCredit } from '@/lib/deposit-credit'

export const dynamic = 'force-dynamic'

/**
 * Moolre webhook receiver. The merchant sets the Callback URL in the Moolre
 * dashboard (Wallet → Callbacks) to point at this route — every transaction
 * that touches the linked wallet will POST here with the result.
 *
 * Setup checklist (done by the operator, not in code):
 *   1. .env.local / Vercel env vars must define MOOLRE_SECRET_KEY (the Secret
 *      Key from Moolre dashboard → Callbacks). It signs every payload.
 *   2. Moolre dashboard → Callbacks → Callback URL =
 *        https://<your-app>/api/payments/moolre/callback
 *
 * Without MOOLRE_SECRET_KEY set the route refuses every request to avoid
 * crediting on a forged callback.
 */
export async function POST(request: Request) {
  const secret = process.env.MOOLRE_SECRET_KEY?.trim()
  if (!secret) {
    console.error('[moolre/callback] MOOLRE_SECRET_KEY not configured')
    return NextResponse.json({ error: 'callback not configured' }, { status: 503 })
  }

  // Moolre signs the raw body with HMAC-SHA256 and ships the hex digest in
  // one of these headers depending on the dashboard version. We accept any
  // of them and compare with timingSafeEqual so request timing can't leak
  // the secret a byte at a time.
  const headerSig =
    request.headers.get('x-moolre-signature') ??
    request.headers.get('x-api-signature') ??
    request.headers.get('x-signature') ??
    ''

  // Read the body as text first so we hash the EXACT bytes Moolre sent. If
  // we parsed to JSON and re-serialised, key ordering / whitespace would
  // change and the signature would never match.
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  if (!verifySignature(rawBody, headerSig, secret)) {
    console.warn('[moolre/callback] signature mismatch — rejecting')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Moolre's payload exposes the transaction status under one of several
  // names depending on operation; we accept any of them.
  const reference = pickString(body, [
    'reference',
    'externalref',
    'externalreference',
    'transactionref',
  ])
  const statusRaw = pickString(body, ['status', 'transactionstatus', 'state'])
  const amountRaw = pickNumber(body, ['amount', 'amountpaid', 'paid_amount'])

  if (!reference) {
    return NextResponse.json({ error: 'reference required' }, { status: 400 })
  }

  // Look up the pending row we wrote on the /start side. If the reference
  // isn't on file we ack the webhook so Moolre doesn't keep retrying, but
  // log loudly so the operator can investigate.
  const pending = await findPaymentByReference(reference)
  if (!pending) {
    console.warn('[moolre/callback] unknown reference', reference)
    return NextResponse.json({ ok: true, reason: 'unknown-reference' })
  }

  // Already credited — idempotent ack.
  if (pending.status === 'success') {
    return NextResponse.json({ ok: true, reason: 'already-credited' })
  }

  const status = (statusRaw ?? '').toLowerCase()
  const isSuccess =
    status === 'success' ||
    status === 'successful' ||
    status === 'completed' ||
    status === 'paid' ||
    status === '1'

  if (!isSuccess) {
    // Final-state failure — keep the row but tag it so admin can see.
    if (status === 'failed' || status === 'cancelled' || status === '0') {
      await markPaymentResolved(pending.id, `moolre status: ${status}`).catch(() => null)
    }
    return NextResponse.json({ ok: true, reason: `status:${status || 'unknown'}` })
  }

  // Sanity check the amount when Moolre reports one. Don't credit if the
  // player short-paid; admin can manually reconcile via /admin/deposits.
  if (amountRaw != null && Math.abs(amountRaw - pending.amount) > 0.01) {
    console.error('[moolre/callback] amount mismatch', {
      reference,
      pendingAmount: pending.amount,
      paidAmount: amountRaw,
    })
    return NextResponse.json({ ok: true, reason: 'amount-mismatch' })
  }

  if (!pending.userId) {
    console.error('[moolre/callback] pending row has no userId', reference)
    return NextResponse.json({ ok: true, reason: 'no-user' })
  }

  try {
    await markPaymentResolved(pending.id, 'moolre webhook')
    await applyDepositCredit(pending.userId, pending.amount)
  } catch (e) {
    console.error('[moolre/callback] credit pipeline failed:', e)
    return NextResponse.json({ error: 'credit failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reason: 'credited' })
}

function verifySignature(body: string, headerSig: string, secret: string): boolean {
  if (!headerSig) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(expected, 'hex')
  // Moolre sometimes lowercases the hex digest, sometimes the dashboard
  // shows it uppercase. Normalise both before comparing.
  let provided: Buffer
  try {
    provided = Buffer.from(headerSig.trim().toLowerCase(), 'hex')
  } catch {
    return false
  }
  if (provided.length !== a.length) return false
  return timingSafeEqual(a, provided)
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}
