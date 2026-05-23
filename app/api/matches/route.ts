import { NextResponse } from 'next/server'
import { getMatchesForSport, supportedSports } from '@/lib/api/odds'
import { readCustomMatchesForSport } from '@/lib/custom-matches-store'
import { readMatchOverridesMap, type MatchOverride } from '@/lib/match-overrides-store'
import { deriveMarketBook } from '@/lib/markets'
import type { Match } from '@/lib/types'

// 30s so the ticking minute on live custom matches stays close to real
// time. The Odds API responses inside this handler are cached for 60s.
export const revalidate = 30

function withDerivedMarkets(m: Match): Match {
  if (m.markets) return m
  const derived = deriveMarketBook(m)
  return derived ? { ...m, markets: derived } : m
}

/**
 * Overlay an admin override on top of a match. Only fields the admin
 * explicitly set are applied; everything else stays from the source.
 */
function applyOverride(m: Match, o: MatchOverride | undefined): Match {
  if (!o) return m
  const next: Match = { ...m }
  if (o.homeScore !== null && o.homeScore !== undefined) next.homeScore = o.homeScore
  if (o.awayScore !== null && o.awayScore !== undefined) next.awayScore = o.awayScore
  if (o.minute !== null && o.minute !== undefined) next.minute = o.minute
  if (o.isLive !== null && o.isLive !== undefined) next.isLive = o.isLive
  if (o.locked) next.locked = true
  return next
}

function hydrateAll(list: Match[], overrides: Map<string, MatchOverride>): Match[] {
  return list.map((m) => withDerivedMarkets(applyOverride(m, overrides.get(m.id))))
}

function isToday(iso: string | undefined, tzOffsetMinutes: number): boolean {
  if (!iso) return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return true
  const local = new Date(t - tzOffsetMinutes * 60_000)
  const nowLocal = new Date(Date.now() - tzOffsetMinutes * 60_000)
  return (
    local.getUTCFullYear() === nowLocal.getUTCFullYear() &&
    local.getUTCMonth() === nowLocal.getUTCMonth() &&
    local.getUTCDate() === nowLocal.getUTCDate()
  )
}

function filterToday(matches: Match[], tzOffsetMinutes: number): Match[] {
  return matches.filter((m) => m.isLive || isToday(m.startTimeISO, tzOffsetMinutes))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sport = (searchParams.get('sport') ?? 'football').toLowerCase()
  const todayOnly = searchParams.get('today') === '1'
  const tzOffsetMinutes = Number(searchParams.get('tzOffset') ?? '0')
  const tzOffset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0

  if (!supportedSports().includes(sport)) {
    return NextResponse.json(
      { error: `unsupported sport: ${sport}` },
      { status: 400 },
    )
  }

  // Pull admin overrides up front; one map applies to both custom + API matches.
  // If the table doesn't exist yet (migration not run) we fall back to empty.
  let overrides: Map<string, MatchOverride>
  try {
    overrides = await readMatchOverridesMap()
  } catch {
    overrides = new Map()
  }

  // Hide finished custom matches from the public feed. A finished match
  // has minute === 'FT' (set by the admin "Final result" button).
  const allCustom = await readCustomMatchesForSport(sport)
  const customMatches = hydrateAll(
    allCustom.filter((m) => m.minute !== 'FT'),
    overrides,
  )
  const maybeFilter = (list: Match[]) => (todayOnly ? filterToday(list, tzOffset) : list)

  try {
    const apiMatches = await getMatchesForSport(sport)
    return NextResponse.json({
      source: customMatches.length > 0 ? 'mixed' : 'odds-api',
      reason: apiMatches.length === 0 ? 'no upcoming events from provider' : undefined,
      matches: maybeFilter([...customMatches, ...hydrateAll(apiMatches, overrides)]),
      customCount: customMatches.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      source: 'odds-api',
      reason: message,
      matches: maybeFilter(customMatches),
      customCount: customMatches.length,
    })
  }
}
