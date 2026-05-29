import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isValidSessionCookie } from '@/lib/admin-auth'
import { findPaymentById, markPaymentResolved } from '@/lib/payments-store'
import { applyDepositCredit } from '@/lib/deposit-credit'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies()
  return isValidSessionCookie(store.get(ADMIN_COOKIE)?.value)
}

/**
 * Admin "Credit & resolve" — for a failed/pending Moolre row, credit the
 * user the recorded amount and flip the payment row to success so it can't
 * be credited twice.
 */
export async function POST(request: Request, { params }: Params) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: { note?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }
  const note = (body.note ?? '').toString().trim().slice(0, 200)

  const payment = await findPaymentById(id)
  if (!payment) return NextResponse.json({ error: 'payment not found' }, { status: 404 })
  if (payment.type !== 'deposit') {
    return NextResponse.json({ error: 'only deposit rows can be resolved' }, { status: 400 })
  }
  if (payment.status === 'success') {
    return NextResponse.json({ error: 'payment already credited' }, { status: 409 })
  }
  if (!payment.userId) {
    return NextResponse.json({ error: 'payment has no user' }, { status: 400 })
  }
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
    return NextResponse.json({ error: 'invalid amount on payment row' }, { status: 400 })
  }

  // Atomically flip the row to success FIRST. If markPaymentResolved
  // returns null another caller (the Moolre callback) raced us and has
  // already credited — bail out instead of crediting again.
  const resolved = await markPaymentResolved(id, note)
  if (!resolved) {
    return NextResponse.json(
      { error: 'payment already credited by another path' },
      { status: 409 },
    )
  }

  // Full deposit pipeline — bumps totals, advances verification step when
  // the amount qualifies, and fires sub-admin commission for referred users.
  const result = await applyDepositCredit(payment.userId, payment.amount)
  if (!result) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  return NextResponse.json({
    payment: resolved,
    user: {
      id: result.user.id,
      name: result.user.name,
      balance: result.user.balance ?? 0,
      totalDeposited: result.user.totalDeposited,
      verificationStep: result.user.verificationStep ?? 0,
    },
    credited: payment.amount,
    isFirstDeposit: result.isFirstDeposit,
    commission: result.commission,
  })
}
