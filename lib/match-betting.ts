import type { Match } from '@/lib/types'

/**
 * Number of minutes before a match's end (live) or start (upcoming) at which
 * we stop accepting new bets on it.
 */
export const BETTING_CUTOFF_MINUTES = 5

/**
 * Total regulation minutes per sport — used to compute "minutes to end" for
 * live matches. Sports without a clean fixed length aren't auto-closed at the
 * end (only at the start).
 */
const REGULATION_MINUTES: Record<string, number> = {
  football: 90,
  basketball: 48, // NBA-ish; this is loose but good enough for a cutoff signal
  hockey: 60,
}

function parseLeadingNumber(value: string | undefined): number | null {
  if (!value) return null
  const m = value.match(/^\s*(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Minutes until the match's scheduled start, given `startTime` like "19:30"
 * (treated as today in the local timezone). Returns null if the field is
 * missing or unparseable. Negative values mean the start time has passed.
 */
export function minutesUntilStart(startTime: string | undefined, now: Date = new Date()): number | null {
  if (!startTime) return null
  const m = startTime.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hours = parseInt(m[1], 10)
  const minutes = parseInt(m[2], 10)
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  // If the time-of-day has already passed today, assume it's tomorrow — that
  // way "19:30" on a 22:00 clock isn't reported as 2.5 hours in the past.
  if (target.getTime() < now.getTime() - 60 * 60 * 1000) {
    target.setDate(target.getDate() + 1)
  }
  return Math.round((target.getTime() - now.getTime()) / 60000)
}

/**
 * For a live football match with minute "85'", returns 5 (90 - 85). For sports
 * without a fixed regulation length we can't compute this and return null.
 */
export function minutesUntilEnd(match: Match): number | null {
  if (!match.isLive) return null
  const sport = (match.sport ?? 'football').toLowerCase()
  const regulation = REGULATION_MINUTES[sport]
  if (!regulation) return null
  const elapsed = parseLeadingNumber(match.minute)
  if (elapsed === null) return null
  return Math.max(0, regulation - elapsed)
}

export interface BettingState {
  closed: boolean
  reason: 'starting-soon' | 'started' | 'finished' | 'admin-locked' | null
  /** Minutes remaining until the cutoff event (start or end). 0 = already cut off. */
  minutesRemaining: number | null
}

/**
 * Decide whether to accept new bets on a given match.
 * Rules:
 *   • Admin manually locked it (custom matches only) → closed.
 *   • Match is live → closed (no in-play betting; lock stays until match
 *     finishes and the admin sets isLive=false).
 *   • Upcoming match within BETTING_CUTOFF_MINUTES of its start time → closed.
 *   • Match's start time has passed but isLive isn't flipped yet → closed
 *     (started — admin still has to mark it live or final).
 */
export function getBettingState(match: Match, now: Date = new Date()): BettingState {
  if (match.locked) {
    return { closed: true, reason: 'admin-locked', minutesRemaining: 0 }
  }

  if (match.isLive) {
    // Any live match is locked. If the elapsed minute already exceeds the
    // regulation length we report it as finished; otherwise it's mid-game.
    const left = minutesUntilEnd(match)
    if (left !== null && left <= 0) {
      return { closed: true, reason: 'finished', minutesRemaining: 0 }
    }
    return { closed: true, reason: 'started', minutesRemaining: left }
  }

  const untilStart = minutesUntilStart(match.startTime, now)
  if (untilStart === null) {
    return { closed: false, reason: null, minutesRemaining: null }
  }
  if (untilStart <= 0) {
    return { closed: true, reason: 'started', minutesRemaining: 0 }
  }
  if (untilStart <= BETTING_CUTOFF_MINUTES) {
    return { closed: true, reason: 'starting-soon', minutesRemaining: untilStart }
  }
  return { closed: false, reason: null, minutesRemaining: untilStart }
}

export function isBettingClosed(match: Match): boolean {
  return getBettingState(match).closed
}
