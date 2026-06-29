import { NextResponse } from 'next/server'
import { verifyAndCreditFlutterwave } from '@/lib/flutterwave-credit'
import { findPaymentByReference } from '@/lib/payments-store'

export const dynamic = 'force-dynamic'

interface VerifyBody {
  reference?: string
}

// JSON verify/poll endpoint. The deposit flow can poll this after the redirect
// to learn when the charge resolves. Withdrawal-fee references are confirmed
// without crediting the wallet.
export async function POST(request: Request) {
  let body: VerifyBody
  try {
    body = (await request.json()) as VerifyBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const reference = (body.reference ?? '').trim()
  if (!reference) {
    return NextResponse.json({ error: 'reference required' }, { status: 400 })
  }

  const pending = await findPaymentByReference(reference).catch(() => null)
  const isFee = pending?.metadata?.purpose === 'withdrawal-fee'

  const result = await verifyAndCreditFlutterwave(reference, { credit: !isFee })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
