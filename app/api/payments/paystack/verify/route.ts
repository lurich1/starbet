import { NextResponse } from 'next/server'
import { verifyPaystackCharge } from '@/lib/paystack'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { reference?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const reference = (body.reference ?? '').trim()
  if (!reference) {
    return NextResponse.json({ error: 'reference required' }, { status: 400 })
  }

  const result = await verifyPaystackCharge(reference)
  if (!result.ok) {
    return NextResponse.json(
      { verified: false, error: result.error ?? 'verification failed', status: result.status },
      { status: 400 },
    )
  }

  return NextResponse.json({
    verified: true,
    status: result.status,
    amount: result.amount,
    currency: result.currency,
    reference: result.reference,
  })
}
