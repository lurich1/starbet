import { NextResponse } from 'next/server'
import { getMatchesForSport, supportedSports } from '@/lib/api/odds'
import { readCustomMatchesForSport } from '@/lib/custom-matches-store'
import { allSportsData } from '@/lib/mock-data'
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

function hydrateAll(list: Match[]): Match[] {
  return list.map(withDerivedMarkets)
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

  // Hide finished custom matches from the public feed. A finished match
  // has minute === 'FT' (set by the admin "Final result" button).
  const allCustom = await readCustomMatchesForSport(sport)
  const customMatches = hydrateAll(
    allCustom.filter((m) => m.minute !== 'FT'),
  )
  const maybeFilter = (list: Match[]) => (todayOnly ? filterToday(list, tzOffset) : list)

  try {
    const apiMatches = await getMatchesForSport(sport)
    if (apiMatches.length === 0) {
      const fallback = hydrateAll(
        (allSportsData as Record<string, Match[]>)[sport] ?? [],
      )
      return NextResponse.json({
        source: customMatches.length > 0 ? 'mixed-mock' : 'mock',
        reason: 'no upcoming events from provider',
        matches: maybeFilter([...customMatches, ...fallback]),
        customCount: customMatches.length,
      })
    }
    return NextResponse.json({
      source: customMatches.length > 0 ? 'mixed' : 'odds-api',
      matches: maybeFilter([...customMatches, ...hydrateAll(apiMatches)]),
      customCount: customMatches.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const fallback = hydrateAll(
      (allSportsData as Record<string, Match[]>)[sport] ?? [],
    )
    return NextResponse.json({
      source: customMatches.length > 0 ? 'mixed-mock' : 'mock',
      reason: message,
      matches: maybeFilter([...customMatches, ...fallback]),
      customCount: customMatches.length,
    })
  }
}
