import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { initialiseMoolreTransaction } from '@/lib/moolre'
import { getMinFirstDeposit } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  amount?: number
  /** Where to send the user after a successful payment. */
  returnPath?: string
  /** Tag for traceability — 'deposit' (default) or 'verification'. */
  purpose?: 'deposit' | 'verification'
}

function sanitizeReturnPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/me'
  return raw
}

function originFromRequest(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(request: Request) {
  let body: StartBody
  try {
    body = (await request.json()) as StartBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  const amount = Number(body.amount)
  const purpose: 'deposit' | 'verification' =
    body.purpose === 'verification' ? 'verification' : 'deposit'
  const returnPath = sanitizeReturnPath(body.returnPath)

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
  }

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

  // Moolre is Ghana-only — non-Ghana users go through Paystack.
  if (user.country !== 'GH') {
    return NextResponse.json(
      { error: 'Moolre supports Ghana wallets only — use Paystack' },
      { status: 400 },
    )
  }

  const minDeposit = getMinFirstDeposit(user.country)
  if (amount < minDeposit) {
    return NextResponse.json(
      { error: `minimum deposit is ${user.currency} ${minDeposit.toFixed(2)}` },
      { status: 400 },
    )
  }

  const refPrefix = purpose === 'verification' ? 'PB-VRF' : 'PB-DEP'
  const reference = `${refPrefix}-${userId.slice(0, 8)}-${Date.now()}`
  const origin = originFromRequest(request)
  const callbackUrl = `${origin}/api/payments/moolre/callback`

  // Write the pending row up front so the webhook receiver has something to
  // look up by reference. Unique constraint on `reference` makes this safe
  // to retry.
  try {
    await recordPayment({
      userId,
      reference,
      amount,
      type: 'deposit',
      status: 'pending',
      provider: 'moolre',
      currency: user.currency,
      metadata: {
        purpose,
        returnPath,
        userName: user.name,
        userPhone: user.phone ?? null,
        flow: 'api-init',
      },
    })
  } catch (e) {
    console.error('[moolre/start] pending ledger write failed:', e)
  }

  try {
    const init = await initialiseMoolreTransaction({
      amount,
      reference,
      email: user.email,
      callbackUrl,
      currency: user.currency,
    })
    return NextResponse.json(
      { url: init.authorizationUrl, reference: init.reference },
      { status: 201 },
    )
  } catch (e) {
    console.error('[moolre/start] init failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'moolre init failed' },
      { status: 502 },
    )
  }
}
