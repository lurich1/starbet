import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { createCharge, paymentMethodForCountry } from '@/lib/flutterwave'
import { getMinFirstDeposit, normalizePhone } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  amount?: number
  returnPath?: string
  purpose?: 'deposit' | 'verification'
  /** Mobile-money phone (GH/KE). */
  phone?: string
  /** Selected payout/mobile-money network key. */
  network?: string
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

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  return { first: parts[0] || 'Customer', last: parts.slice(1).join(' ') || '-' }
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

  // Mobile-money countries need a valid phone; bank countries don't.
  let phone: string | undefined
  if (user.country === 'GH' || user.country === 'KE') {
    phone = normalizePhone(user.country, body.phone ?? user.phone ?? '') || undefined
    if (!phone) {
      return NextResponse.json(
        { error: `enter a valid ${user.country === 'GH' ? 'Ghana' : 'Kenya'} mobile-money number` },
        { status: 400 },
      )
    }
  }

  const refPrefix = purpose === 'verification' ? 'PB-VRF' : 'PB-DEP'
  const reference = `${refPrefix}-${userId.slice(0, 8)}-${Date.now()}`
  const redirectUrl = `${originFromRequest(request)}/api/payments/flutterwave/callback?returnPath=${encodeURIComponent(returnPath)}&ref=${encodeURIComponent(reference)}`
  const name = splitName(user.name)

  try {
    const charge = await createCharge({
      reference,
      amount,
      currency: user.currency,
      redirectUrl,
      customer: { email: user.email, firstName: name.first, lastName: name.last, phone },
      paymentMethod: paymentMethodForCountry(user.country, { phone, network: body.network }),
      meta: { userId, purpose, country: user.country },
    })

    // Persist the pending row keyed on our reference, with the Flutterwave
    // charge id so the callback can confirm + credit it.
    await recordPayment({
      userId,
      reference,
      amount,
      type: 'deposit',
      status: 'pending',
      provider: 'flutterwave',
      currency: user.currency,
      metadata: {
        purpose,
        flwChargeId: charge.id,
        returnPath,
        userName: user.name,
        userPhone: user.phone ?? null,
        country: user.country,
      },
    }).catch((e) => console.error('[flutterwave/start] ledger write failed:', e))

    return NextResponse.json(
      {
        reference,
        chargeId: charge.id,
        status: charge.status,
        redirectUrl: charge.next_action?.redirect_url?.url ?? null,
        nextAction: charge.next_action ?? null,
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('[flutterwave/start] charge failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'flutterwave charge failed' },
      { status: 502 },
    )
  }
}
