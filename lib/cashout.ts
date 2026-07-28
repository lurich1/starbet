import type { PlacedBet } from '@/lib/types'

// Cash-out value = a fixed fraction of the potential return: 30%.
// `now` is accepted for call-site compatibility but the value is time-independent.
const CASHOUT_RATE = 0.3 // 30% of potential win

/**
 * The amount we'd pay to cash this bet out right now. 0 for settled bets.
 */
export function computeCashout(
  bet: Pick<PlacedBet, 'status' | 'stake' | 'potentialWin' | 'placedAt'>,
  _now?: number,
): number {
  if (bet.status !== 'pending') return 0
  const potential = Number(bet.potentialWin) || 0
  if (potential <= 0) return 0
  return +(potential * CASHOUT_RATE).toFixed(2)
}
