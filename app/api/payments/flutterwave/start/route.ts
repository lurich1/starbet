import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { createStandardPayment } from '@/lib/flutterwave'
import { getMinFirstDeposit, normalizePhone } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  amount?: number
  returnPath?: string
  purpose?: 'deposit' | 'verification'
  phone?: string
  network?: string
}

function sanitizeReturnPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/me'
  return raw
}

function originFromRequest(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) {
    // Flutterwave needs an absolute redirect_url; prepend https:// if the env
    // value was set without a protocol (a common misconfig on Vercel).
    const withProto = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`
    return withProto.replace(/\/$/, '')
  }
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

  const minDeposit = getMinFirstDeposit(user.country)
  if (amount < minDeposit) {
    return NextResponse.json(
      { error: `minimum deposit is ${user.currency} ${minDeposit.toFixed(2)}` },
      { status: 400 },
    )
  }

  const refPrefix = purpose === 'verification' ? 'PB-VRF' : 'PB-DEP'
  const reference = `${refPrefix}-${userId.slice(0, 8)}-${Date.now()}`
  const phone = normalizePhone(user.country, body.phone ?? user.phone ?? '') || undefined

  try {
    // Hosted Standard checkout — carries our tx_ref + a redirect_url so the
    // customer is brought back to the site and the callback can credit. GH/KE
    // lead with mobile money, which still triggers the on-phone PIN prompt.
    const redirectUrl = `${originFromRequest(request)}/api/payments/flutterwave/callback?returnPath=${encodeURIComponent(returnPath)}&ref=${encodeURIComponent(reference)}`
    const std = await createStandardPayment({
      reference,
      amount,
      currency: user.currency,
      country: user.country,
      email: user.email,
      fullname: user.name,
      phone,
      redirectUrl,
    })

    await recordPayment({
      userId,
      reference,
      amount,
      type: 'deposit',
      status: 'pending',
      provider: 'flutterwave',
      currency: user.currency,
      metadata: { purpose, returnPath, country: user.country, userName: user.name },
    }).catch((e) => console.error('[flutterwave/start] ledger write failed:', e))

    return NextResponse.json({ reference, redirectUrl: std.link }, { status: 201 })
  } catch (e) {
    console.error('[flutterwave/start] charge failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'flutterwave charge failed' },
      { status: 502 },
    )
  }
}
