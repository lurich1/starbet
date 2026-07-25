import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { chargeMobileMoney } from '@/lib/paystack'
import { getMinFirstDeposit, normalizePhone } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  amount?: number
  phone?: string
  provider?: 'mtn' | 'vod' | 'atl'
  purpose?: 'deposit' | 'verification'
}

// Start a Paystack mobile-money charge — the customer approves on their phone
// (or is asked for an OTP). The client polls /status until it clears.
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

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
  }

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

  const minDeposit = getMinFirstDeposit(user.country)
  if (amount < minDeposit) {
    return NextResponse.json(
      { error: `Minimum deposit is ${user.currency} ${minDeposit.toFixed(2)}.` },
      { status: 400 },
    )
  }

  const phone = normalizePhone(user.country, body.phone ?? user.phone ?? '')
  if (!phone) {
    return NextResponse.json(
      { error: `Enter a valid ${user.country} mobile-money number.` },
      { status: 400 },
    )
  }

  const reference = `PB-PS-${userId.slice(0, 8)}-${Date.now()}`

  try {
    const charge = await chargeMobileMoney({
      reference,
      amount,
      email: user.email || `user-${reference}@betfus.com`,
      phone,
      provider: body.provider ?? 'mtn',
    })

    await recordPayment({
      userId,
      reference: charge.reference,
      amount,
      type: 'deposit',
      status: 'pending',
      provider: 'paystack',
      currency: user.currency,
      metadata: { purpose, country: user.country, userName: user.name },
    }).catch((e) => console.error('[paystack/momo/start] ledger write failed:', e))

    return NextResponse.json(
      {
        reference: charge.reference,
        status: charge.status,
        displayText: charge.displayText,
        // 'send_otp' when Paystack wants an SMS code entered.
        authMode: charge.status === 'send_otp' ? 'otp' : undefined,
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('[paystack/momo/start] charge failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Mobile-money charge failed.' },
      { status: 502 },
    )
  }
}
