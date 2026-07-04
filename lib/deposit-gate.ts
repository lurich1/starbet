import { latestSuccessfulDepositAt } from '@/lib/payments-store'

// A player may only stake if they've made a successful deposit within this
// rolling window. This stops players from recycling the same wallet balance
// day after day — every 24h of play needs a fresh top-up.
export const DEPOSIT_WINDOW_MS = 24 * 60 * 60 * 1000

export const DEPOSIT_REQUIRED_MESSAGE =
  'Bet submission failed. A new deposit is required before this bet can be placed.'

export interface DepositGateResult {
  allowed: boolean
  lastDepositAt: string | null
}

/**
 * Server-side gate: has this user deposited within the last 24 hours?
 * Returns `allowed: false` for users who've never deposited or whose last
 * deposit is older than the window.
 */
export async function checkRecentDeposit(userId: string): Promise<DepositGateResult> {
  const lastDepositAt = await latestSuccessfulDepositAt(userId)
  if (!lastDepositAt) return { allowed: false, lastDepositAt: null }
  const age = Date.now() - new Date(lastDepositAt).getTime()
  const allowed = Number.isFinite(age) && age >= 0 && age <= DEPOSIT_WINDOW_MS
  return { allowed, lastDepositAt }
}
