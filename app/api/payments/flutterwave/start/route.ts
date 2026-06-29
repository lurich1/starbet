import { NextResponse } from 'next/server'
import { findUserById } from '@/lib/users-store'
import { getPaymentLink } from '@/lib/flutterwave'
import { getMinFirstDeposit } from '@/lib/countries'

export const dynamic = 'force-dynamic'

interface StartBody {
  userId?: string
  amount?: number
  purpose?: 'deposit' | 'verification'
}

// Deposits go through the hosted Flutterwave payment link. The customer enters
// the amount on Flutterwave's page; the webhook credits their wallet (matched
// by account email) once the charge succeeds. We just validate and hand back
// the link + the email the customer must pay with.
export async function POST(request: Request) {
  let body: StartBody
  try {
    body = (await request.json()) as StartBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

  const minDeposit = getMinFirstDeposit(user.country)

  return NextResponse.json(
    {
      redirectUrl: getPaymentLink(),
      payWithEmail: user.email,
      minDeposit,
      currency: user.currency,
    },
    { status: 200 },
  )
}
