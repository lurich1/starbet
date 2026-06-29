import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { recordPayment } from '@/lib/payments-store'
import { getPaystackPublicKey, initialiseTransaction, toMinorUnits } from '@/lib/paystack'
import { getWithdrawalFee } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  returnPath?: string
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

// Starts a Paystack transaction for the non-refundable withdrawal fee. The fee
// is NOT credited to the wallet — the matching verify route only marks the
// payment row 'success' so the withdraw route can consume it once.
export async function POST(request: Request) {
  let body: StartBody
  try {
    body = (await request.json()) as StartBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  const returnPath = sanitizeReturnPath(body.returnPath)
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

  const fee = getWithdrawalFee(user.country)
  const reference = `PB-WFEE-${userId.slice(0, 8)}-${Date.now()}`
  const callbackUrl = `${originFromRequest(request)}/api/payments/paystack/callback?returnPath=${encodeURIComponent(returnPath)}`

  try {
    await recordPayment({
      userId,
      reference,
      amount: fee,
      // The fee is money the user pays in; it does not increase the wallet
      // balance. We tag it via metadata.purpose so it's never run through the
      // deposit-credit pipeline and the transaction log can label it a fee.
      type: 'deposit',
      status: 'pending',
      provider: 'paystack',
      currency: user.currency,
      metadata: {
        purpose: 'withdrawal-fee',
        returnPath,
        userName: user.name,
        userPhone: user.phone ?? null,
        country: user.country,
      },
    })
  } catch (e) {
    console.error('[paystack/withdrawal-fee/start] pending ledger write failed:', e)
  }

  // Use the customer's real email so the fee transaction is tied to them.
  const customerEmail = user.email?.trim() || `customer+${userId}@noreply.invalid`

  try {
    const init = await initialiseTransaction({
      email: customerEmail,
      amount: fee,
      currency: user.currency,
      reference,
      callbackUrl,
      metadata: {
        userId,
        purpose: 'withdrawal-fee',
        country: user.country,
        userName: user.name,
      },
    })
    return NextResponse.json(
      {
        url: init.authorization_url,
        reference: init.reference,
        accessCode: init.access_code,
        publicKey: getPaystackPublicKey(),
        amountMinor: toMinorUnits(fee, user.currency),
        amount: fee,
        currency: user.currency,
        email: customerEmail,
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('[paystack/withdrawal-fee/start] init failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'paystack init failed' },
      { status: 502 },
    )
  }
}
