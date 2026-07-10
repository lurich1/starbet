import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { chargeMobileMoney } from '@/lib/flutterwave'
import { getMinFirstDeposit, normalizePhone } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  amount?: number
  phone?: string
  provider?: 'mtn' | 'vod' | 'atl'
  purpose?: 'deposit' | 'verification'
}

// MobileMoneyForm provider keys → our Flutterwave network keys (odds.ts codes).
const PROVIDER_TO_NETWORK: Record<string, string> = {
  mtn: 'mtn',
  vod: 'telecel',
  atl: 'airteltigo',
}

// Direct Flutterwave mobile-money charge — triggers the on-phone PIN prompt so
// the customer pays inside our own checkout (no hosted-page redirect). The
// client then polls /api/payments/flutterwave/status until it clears.
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
  const network = PROVIDER_TO_NETWORK[body.provider ?? 'mtn'] ?? 'mtn'

  const refPrefix = purpose === 'verification' ? 'PB-VRF' : 'PB-DEP'
  const reference = `${refPrefix}-${userId.slice(0, 8)}-${Date.now()}`

  try {
    const charge = await chargeMobileMoney({
      reference,
      amount,
      currency: user.currency,
      country: user.country,
      email: user.email,
      phone,
      fullname: user.name,
      network,
    })

    // Record the pending row so the status poller can verify + credit it.
    await recordPayment({
      userId,
      reference,
      amount,
      type: 'deposit',
      status: 'pending',
      provider: 'flutterwave',
      currency: user.currency,
      metadata: { purpose, country: user.country, userName: user.name, network },
    }).catch((e) => console.error('[flutterwave/momo/start] ledger write failed:', e))

    return NextResponse.json(
      {
        reference,
        status: charge.status,
        displayText: charge.message,
        // Some networks (e.g. Telecel voucher) hand back a redirect to finish.
        redirect: charge.redirect ?? undefined,
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('[flutterwave/momo/start] charge failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Mobile-money charge failed.' },
      { status: 502 },
    )
  }
}
