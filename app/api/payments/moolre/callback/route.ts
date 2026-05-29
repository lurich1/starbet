import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  findPaymentByReference,
  markPaymentResolved,
} from '@/lib/payments-store'
import { applyDepositCredit } from '@/lib/deposit-credit'
import { verifyMoolreTransaction } from '@/lib/moolre'

export const dynamic = 'force-dynamic'

/**
 * Moolre callback receiver.
 *
 * GET — the primary path. Moolre redirects the customer here after payment
 * with `?reference=<ours>` in the URL. We call Moolre's `state: confirm`
 * endpoint to authoritatively check the transaction status, credit the
 * player on success, and then 303-redirect the browser back to the
 * `returnPath` we baked into the callback URL on /start.
 *
 * POST — defence-in-depth. If the merchant configures a server webhook
 * in their Moolre dashboard, the same handler accepts it: verify the
 * HMAC-SHA256 over the raw body using MOOLRE_SECRET_KEY, then credit.
 * Idempotent — if the GET path already credited, this is a no-op ack.
 */

// ────────────────────────────────────────────────────────────────────────
// GET — user redirect after Moolre payment
// ────────────────────────────────────────────────────────────────────────

function sanitizeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/me'
  return raw
}

function redirectWith(originUrl: URL, returnPath: string, status: string) {
  const url = new URL(returnPath, originUrl)
  url.searchParams.set('moolre', status)
  return NextResponse.redirect(url, 303)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const reference =
    url.searchParams.get('reference') ??
    url.searchParams.get('externalref') ??
    ''
  const returnPath = sanitizeReturnPath(url.searchParams.get('returnPath'))

  if (!reference) {
    console.warn('[moolre/callback:GET] missing reference', request.url)
    return redirectWith(url, returnPath, 'missing-reference')
  }

  const pending = await findPaymentByReference(reference)
  if (!pending) {
    console.warn('[moolre/callback:GET] unknown reference', reference)
    return redirectWith(url, returnPath, 'unknown-reference')
  }

  if (pending.status === 'success') {
    return redirectWith(url, returnPath, 'already-credited')
  }

  // Server-to-server confirm. Moolre's response is authoritative — we
  // never trust the user-redirect URL alone since the player controls it.
  let verified
  try {
    verified = await verifyMoolreTransaction(reference)
  } catch (e) {
    console.error('[moolre/callback:GET] verify failed:', e)
    return redirectWith(url, returnPath, 'verify-failed')
  }

  if (!verified.ok) {
    console.warn('[moolre/callback:GET] confirm not ok', {
      reference,
      message: verified.message,
      raw: verified.raw,
    })
    // Mark resolved so it stops appearing in the pending queue, with the
    // operator-visible note containing Moolre's actual message.
    await markPaymentResolved(
      pending.id,
      `moolre status: ${verified.message ?? 'not-ok'}`,
    ).catch(() => null)
    return redirectWith(url, returnPath, 'failed')
  }

  if (!pending.userId) {
    console.error('[moolre/callback:GET] pending row has no userId', reference)
    return redirectWith(url, returnPath, 'no-user')
  }

  try {
    await markPaymentResolved(pending.id, 'moolre user-redirect confirm')
    await applyDepositCredit(pending.userId, pending.amount)
  } catch (e) {
    console.error('[moolre/callback:GET] credit pipeline failed:', e)
    return redirectWith(url, returnPath, 'credit-failed')
  }

  return redirectWith(url, returnPath, 'success')
}

// ────────────────────────────────────────────────────────────────────────
// POST — optional server webhook (HMAC-signed)
// ────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const secret = process.env.MOOLRE_SECRET_KEY?.trim()
  if (!secret) {
    // Webhook is optional — the GET redirect handles the common path. If
    // the operator hasn't configured a server webhook, ack quietly so we
    // don't 503 anything Moolre sends as a courtesy.
    return NextResponse.json({ ok: true, reason: 'webhook-disabled' })
  }

  const headerSig =
    request.headers.get('x-moolre-signature') ??
    request.headers.get('x-api-signature') ??
    request.headers.get('x-signature') ??
    ''

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  if (!verifySignature(rawBody, headerSig, secret)) {
    console.warn('[moolre/callback:POST] signature mismatch — rejecting')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

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

  const pending = await findPaymentByReference(reference)
  if (!pending) {
    return NextResponse.json({ ok: true, reason: 'unknown-reference' })
  }

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
    if (status === 'failed' || status === 'cancelled' || status === '0') {
      await markPaymentResolved(pending.id, `moolre status: ${status}`).catch(() => null)
    }
    return NextResponse.json({ ok: true, reason: `status:${status || 'unknown'}` })
  }

  if (amountRaw != null && Math.abs(amountRaw - pending.amount) > 0.01) {
    console.error('[moolre/callback:POST] amount mismatch', {
      reference,
      pendingAmount: pending.amount,
      paidAmount: amountRaw,
    })
    return NextResponse.json({ ok: true, reason: 'amount-mismatch' })
  }

  if (!pending.userId) {
    return NextResponse.json({ ok: true, reason: 'no-user' })
  }

  try {
    await markPaymentResolved(pending.id, 'moolre server webhook')
    await applyDepositCredit(pending.userId, pending.amount)
  } catch (e) {
    console.error('[moolre/callback:POST] credit pipeline failed:', e)
    return NextResponse.json({ error: 'credit failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reason: 'credited' })
}

function verifySignature(body: string, headerSig: string, secret: string): boolean {
  if (!headerSig) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(expected, 'hex')
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
