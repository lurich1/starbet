// Apply a confirmed deposit to a user's wallet: update totals (via
// recordDeposit, which also stamps firstDepositAt for first-timers),
// advance the withdrawal-verification gate when the amount qualifies,
// and fire sub-admin commission for referred users.
//
// Reused by every path that confirms a deposit:
//   - /api/admin/users/[id]/credit (admin manually crediting from /admin/players)
//   - /api/admin/payments/[id]/resolve (admin clicking 'Credit & resolve' on a
//     pending/failed payments row)
//   - /api/payments/paystack/callback (Paystack auto-credit after verify)
//
// Pure 'bonus' credits (which should NOT count toward verification or
// commission) should bypass this helper and call creditBalance directly.
//
// The verification threshold is country-aware: 200 GHS for Ghana, ₦30,000 for
// Nigeria, etc. (see lib/countries.ts).

import {
  addCommission,
  advanceVerificationStep,
  findUserById,
  recordDeposit,
} from '@/lib/users-store'
import { creditCommission, findSubAdminById } from '@/lib/sub-admins-store'
import { COMMISSION_RATE, type AppUser } from '@/lib/types'
import { getVerificationAmount } from '@/lib/countries'

export interface ApplyDepositResult {
  user: AppUser
  isFirstDeposit: boolean
  commission: {
    amount: number
    rate: number
    subAdminId: string
    currency: AppUser['currency']
  } | null
}

export async function applyDepositCredit(
  userId: string,
  amount: number,
): Promise<ApplyDepositResult | null> {
  // Need the user's country to know what verification threshold applies and
  // what currency to attribute the commission row to.
  const userBefore = await findUserById(userId)
  if (!userBefore) return null

  const result = await recordDeposit(userId, amount)
  if (!result) return null

  let user = result.user
  const verificationThreshold = getVerificationAmount(userBefore.country)

  // Commission fires on EVERY confirmed deposit (not just the first) as long
  // as the user was referred by an approved sub-admin. Skip reasons are
  // logged so it's easy to diagnose "I deposited but my referrer didn't get
  // paid" reports from production Vercel logs.
  //
  // Runs BEFORE the verification-step bump. If the verification update ever
  // throws (e.g. a pending CHECK-constraint migration), the commission still
  // lands instead of being silently swallowed alongside the failed step.
  let commission: ApplyDepositResult['commission'] = null
  if (!user.referredBySubAdminId) {
    console.log('[deposit-credit] commission skipped: user not referred', {
      userId: user.id,
      amount,
      depositNumber: result.isFirst ? 1 : '2+',
    })
  } else {
    const sa = await findSubAdminById(user.referredBySubAdminId)
    if (!sa) {
      console.warn('[deposit-credit] commission skipped: referring sub-admin not found', {
        userId: user.id,
        subAdminId: user.referredBySubAdminId,
        amount,
      })
    } else if (!sa.approved) {
      console.warn('[deposit-credit] commission skipped: referring sub-admin not approved', {
        userId: user.id,
        subAdminId: sa.id,
        subAdminName: sa.name,
        amount,
      })
    } else {
      const amt = +(amount * COMMISSION_RATE).toFixed(2)
      commission = await fireCommission({
        subAdminId: sa.id,
        userId: user.id,
        amount,
        commissionAmount: amt,
        currency: user.currency,
        depositNumber: result.isFirst ? 1 : '2+',
      })
    }
  }

  // Verification step is best-effort: a failure here (stale CHECK constraint,
  // transient DB blip) must not roll back the commission or the wallet
  // credit that already happened above.
  if (
    amount >= verificationThreshold &&
    (user.verificationStep ?? 0) < 4
  ) {
    try {
      const advanced = await advanceVerificationStep(userId)
      if (advanced) user = advanced
    } catch (e) {
      console.error('[deposit-credit] verification-step advance failed (deposit + commission already landed)', {
        userId: user.id,
        currentStep: user.verificationStep ?? 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { user, isFirstDeposit: result.isFirst, commission }
}

// Two-attempt commission write so a single transient supabase error doesn't
// strand a commission. Never rethrows — the caller (verifyAndCreditPaystack
// etc.) treats any throw as "credit pipeline failed" and tells the user the
// deposit didn't work, but by this point the wallet has already been funded
// in applyDepositCredit above. We'd rather lose the commission row (and
// surface it loudly in logs for backfill) than confuse the depositor.
async function fireCommission(params: {
  subAdminId: string
  userId: string
  amount: number
  commissionAmount: number
  currency: AppUser['currency']
  depositNumber: number | string
}): Promise<ApplyDepositResult['commission']> {
  const { subAdminId, userId, amount, commissionAmount, currency, depositNumber } = params
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await creditCommission(subAdminId, commissionAmount, currency)
      await addCommission({
        subAdminId,
        userId,
        depositAmount: amount,
        commission: commissionAmount,
        rate: COMMISSION_RATE,
        currency,
      })
      console.log('[deposit-credit] commission credited', {
        userId,
        subAdminId,
        depositAmount: amount,
        commissionAmount,
        currency,
        depositNumber,
        attempt,
      })
      return { amount: commissionAmount, rate: COMMISSION_RATE, subAdminId, currency }
    } catch (e) {
      lastErr = e
      console.error('[deposit-credit] commission attempt failed', {
        attempt,
        userId,
        subAdminId,
        amount,
        commissionAmount,
        currency,
        error: e instanceof Error ? e.message : String(e),
      })
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 150))
      }
    }
  }
  console.error('[deposit-credit] commission permanently failed — backfill required', {
    userId,
    subAdminId,
    amount,
    commissionAmount,
    currency,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  })
  return null
}
