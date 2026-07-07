// When a referred customer withdraws money, reverse the referring sub-admin's
// commission on the amount that's leaving. Uses the same COMMISSION_RATE the
// sub-admin earned on deposits (70%), and only ever runs on a *completed*
// withdrawal so a failed/refunded payout doesn't wrongly dock a sub-admin.

import { COMMISSION_RATE } from '@/lib/types'
import { findUserById } from '@/lib/users-store'
import { findSubAdminById, debitCommission } from '@/lib/sub-admins-store'
import type { CurrencyCode } from '@/lib/countries'

/**
 * Claw back commission from the customer's referrer for a settled withdrawal.
 * Best-effort: a missing referrer, unapproved sub-admin, or store hiccup is
 * logged and swallowed so it can never block or reverse the customer's payout.
 */
export async function reverseCommissionOnWithdrawal(
  userId: string,
  withdrawalAmount: number,
  currency: CurrencyCode,
): Promise<void> {
  try {
    const user = await findUserById(userId)
    if (!user?.referredBySubAdminId) return
    const sa = await findSubAdminById(user.referredBySubAdminId)
    if (!sa) return

    const clawback = +(withdrawalAmount * COMMISSION_RATE).toFixed(2)
    if (clawback <= 0) return
    await debitCommission(sa.id, clawback, currency)
    console.log('[withdrawal-commission] clawed back commission', {
      subAdminId: sa.id,
      userId,
      withdrawalAmount,
      clawback,
      currency,
    })
  } catch (e) {
    console.error('[withdrawal-commission] clawback failed (payout unaffected):', e)
  }
}
