import { NextResponse } from 'next/server'
import {
  addCommission,
  advanceVerificationStep,
  findUserById,
  recordDeposit,
} from '@/lib/users-store'
import { creditCommission, findSubAdminById } from '@/lib/sub-admins-store'
import { COMMISSION_RATE } from '@/lib/types'
import { getMinFirstDeposit, verifyPaystackCharge } from '@/lib/paystack'

const VERIFICATION_DEPOSIT_AMOUNT = 200

export const dynamic = 'force-dynamic'

// In-memory dedup for Paystack references within a single serverless instance.
// Catches the most common double-credit causes: success callback firing twice,
// React Strict Mode dev double-render, fast user double-tap.
// PROPER FIX requires a schema-level unique constraint on a payment ledger
// table — flag for follow-up; this guard is best-effort, not bulletproof
// across cold starts.
const processedRefs = new Set<string>()
const MAX_REFS_CACHED = 5000

export async function POST(request: Request) {
  let body: { userId?: string; amount?: number; reference?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const userId = (body.userId ?? '').trim()
  const amount = Number(body.amount)
  const reference = (body.reference ?? '').trim()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
  }

  const existing = await findUserById(userId)
  if (!existing) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Enforce minimum deposit on EVERY deposit (configurable via MIN_FIRST_DEPOSIT, default 200).
  const isFirstDeposit = !existing.firstDepositAt
  const minDeposit = getMinFirstDeposit()
  if (amount < minDeposit) {
    return NextResponse.json(
      { error: `minimum deposit is GHS ${minDeposit.toFixed(2)}` },
      { status: 400 },
    )
  }

  // Verify payment with Paystack before crediting the user. A missing
  // reference is only allowed when Paystack is not configured (demo mode).
  if (process.env.PAYSTACK_SECRET_KEY) {
    if (!reference) {
      return NextResponse.json(
        { error: 'payment reference required' },
        { status: 400 },
      )
    }
    const verify = await verifyPaystackCharge(reference)
    if (!verify.ok) {
      return NextResponse.json(
        { error: verify.error ?? 'payment verification failed' },
        { status: 402 },
      )
    }
    if (verify.amount !== undefined && verify.amount < amount) {
      return NextResponse.json(
        {
          error: `payment amount mismatch (paid ${verify.amount}, claiming ${amount})`,
        },
        { status: 402 },
      )
    }
  }

  // Reject the same reference twice (best-effort, per-instance).
  if (reference) {
    if (processedRefs.has(reference)) {
      return NextResponse.json(
        { error: 'this payment has already been credited', duplicate: true },
        { status: 409 },
      )
    }
    processedRefs.add(reference)
    // Bound the set so it can't grow unbounded on a long-running instance.
    if (processedRefs.size > MAX_REFS_CACHED) {
      const first = processedRefs.values().next().value
      if (first) processedRefs.delete(first)
    }
  }

  const result = await recordDeposit(userId, amount)
  if (!result) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Each deposit of ≥ 200 GHS advances the withdrawal-verification gate
  // (0 → 1 → 2). Once at 2, withdrawals are unlocked.
  let verifiedUser = result.user
  if (
    amount >= VERIFICATION_DEPOSIT_AMOUNT &&
    (verifiedUser.verificationStep ?? 0) < 2
  ) {
    const updated = await advanceVerificationStep(userId)
    if (updated) verifiedUser = updated
  }

  let commissionInfo: {
    commission: number
    rate: number
    subAdmin?: { id: string; name: string; referralCode: string }
  } | null = null

  // Fire commission on EVERY deposit from a sub-admin-referred user.
  // Users without a referral code (referredBySubAdminId unset) pay no commission.
  if (result.user.referredBySubAdminId) {
    const sa = await findSubAdminById(result.user.referredBySubAdminId)
    if (sa && sa.approved) {
      const commission = +(amount * COMMISSION_RATE).toFixed(2)
      await creditCommission(sa.id, commission)
      await addCommission({
        subAdminId: sa.id,
        userId: result.user.id,
        depositAmount: amount,
        commission,
        rate: COMMISSION_RATE,
      })
      commissionInfo = {
        commission,
        rate: COMMISSION_RATE,
        subAdmin: { id: sa.id, name: sa.name, referralCode: sa.referralCode },
      }
    }
  }

  return NextResponse.json(
    {
      user: {
        id: verifiedUser.id,
        name: verifiedUser.name,
        firstDepositAmount: verifiedUser.firstDepositAmount,
        firstDepositAt: verifiedUser.firstDepositAt,
        totalDeposited: verifiedUser.totalDeposited,
        totalWithdrawn: verifiedUser.totalWithdrawn ?? 0,
        balance: verifiedUser.balance ?? verifiedUser.totalDeposited,
        verificationStep: verifiedUser.verificationStep ?? 0,
      },
      isFirstDeposit: result.isFirst,
      commission: commissionInfo,
    },
    { status: 201 },
  )
}
