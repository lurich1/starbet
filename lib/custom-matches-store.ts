import type { Match } from '@/lib/types'
import { supabaseServer } from '@/lib/supabase'

interface CustomMatchRow {
  id: string
  sport: string
  league: string
  country: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  minute: string | null
  minute_set_at: string | null
  start_time: string | null
  start_time_utc: string | null
  is_live: boolean
  odds_home: number
  odds_draw: number
  odds_away: number
  created_at: string
}

/**
 * Parse a stored "45'" / "90+3'" / "FT" minute string into a starting integer.
 * Returns null when the minute isn't numeric (e.g. "HT", "FT") — those don't tick.
 */
function parseMinute(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.match(/^(\d+)(?:\+(\d+))?/)
  if (!m) return null
  const base = Number(m[1])
  const extra = m[2] ? Number(m[2]) : 0
  if (!Number.isFinite(base)) return null
  return base + extra
}

/** Compute the live-ticking minute. Returns the display string. */
function tickingMinute(row: CustomMatchRow): string | undefined {
  if (!row.is_live) return row.minute ?? undefined
  if (row.minute === 'FT' || row.minute === 'HT') return row.minute
  const start = parseMinute(row.minute)
  if (start === null) return row.minute ?? undefined
  if (!row.minute_set_at) return `${start}'`
  const setAt = new Date(row.minute_set_at).getTime()
  if (Number.isNaN(setAt)) return `${start}'`
  const elapsedMin = Math.max(0, Math.floor((Date.now() - setAt) / 60_000))
  // Cap at 120' so a forgotten live match doesn't display "8473'".
  const current = Math.min(120, start + elapsedMin)
  return `${current}'`
}

function rowToMatch(row: CustomMatchRow): Match {
  return {
    id: row.id,
    league: row.league,
    country: row.country,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    minute: tickingMinute(row),
    startTime: row.start_time ?? undefined,
    startTimeISO: row.start_time_utc ?? undefined,
    isLive: row.is_live,
    odds: {
      home: Number(row.odds_home),
      draw: Number(row.odds_draw),
      away: Number(row.odds_away),
    },
    sport: row.sport,
    custom: true,
  }
}

function matchToRow(input: Omit<Match, 'id' | 'custom'> & { sport: string }) {
  return {
    sport: input.sport,
    league: input.league,
    country: input.country ?? '',
    home_team: input.homeTeam,
    away_team: input.awayTeam,
    home_score: input.homeScore ?? null,
    away_score: input.awayScore ?? null,
    minute: input.minute ?? null,
    // Setting a fresh minute resets the ticking clock to "now"
    minute_set_at:
      input.isLive && input.minute && input.minute !== 'FT' && input.minute !== 'HT'
        ? new Date().toISOString()
        : null,
    start_time: input.startTime ?? null,
    start_time_utc: input.startTimeISO ?? null,
    is_live: input.isLive,
    odds_home: input.odds.home,
    odds_draw: input.odds.draw,
    odds_away: input.odds.away,
  }
}

export async function readCustomMatches(): Promise<Match[]> {
  const { data, error } = await supabaseServer()
    .from('custom_matches')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`customMatches.readAll: ${error.message}`)
  return ((data ?? []) as CustomMatchRow[]).map(rowToMatch)
}

export async function readCustomMatchesForSport(sport: string): Promise<Match[]> {
  const { data, error } = await supabaseServer()
    .from('custom_matches')
    .select('*')
    .eq('sport', sport.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) throw new Error(`customMatches.readForSport: ${error.message}`)
  return ((data ?? []) as CustomMatchRow[]).map(rowToMatch)
}

export async function addCustomMatch(
  input: Omit<Match, 'id' | 'custom'> & { sport: string },
): Promise<Match> {
  const { data, error } = await supabaseServer()
    .from('custom_matches')
    .insert(matchToRow(input))
    .select('*')
    .single()
  if (error) throw new Error(`customMatches.add: ${error.message}`)
  return rowToMatch(data as CustomMatchRow)
}

export async function updateCustomMatch(
  id: string,
  patch: Partial<Match>,
): Promise<Match | null> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.league !== undefined) dbPatch.league = patch.league
  if (patch.country !== undefined) dbPatch.country = patch.country
  if (patch.homeTeam !== undefined) dbPatch.home_team = patch.homeTeam
  if (patch.awayTeam !== undefined) dbPatch.away_team = patch.awayTeam
  if (patch.homeScore !== undefined) dbPatch.home_score = patch.homeScore
  if (patch.awayScore !== undefined) dbPatch.away_score = patch.awayScore
  if (patch.minute !== undefined) {
    dbPatch.minute = patch.minute
    // Re-anchor the ticking clock whenever the admin sets a fresh minute
    // (and the match is/will be live). 'FT' and 'HT' don't tick.
    const willBeLive = patch.isLive ?? true
    dbPatch.minute_set_at =
      willBeLive && patch.minute && patch.minute !== 'FT' && patch.minute !== 'HT'
        ? new Date().toISOString()
        : null
  }
  if (patch.startTime !== undefined) dbPatch.start_time = patch.startTime
  if (patch.startTimeISO !== undefined) dbPatch.start_time_utc = patch.startTimeISO
  if (patch.isLive !== undefined) dbPatch.is_live = patch.isLive
  if (patch.sport !== undefined) dbPatch.sport = patch.sport
  if (patch.odds) {
    dbPatch.odds_home = patch.odds.home
    dbPatch.odds_draw = patch.odds.draw
    dbPatch.odds_away = patch.odds.away
  }

  if (Object.keys(dbPatch).length === 0) return null

  const { data, error } = await supabaseServer()
    .from('custom_matches')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`customMatches.update: ${error.message}`)
  return data ? rowToMatch(data as CustomMatchRow) : null
}

export async function deleteCustomMatch(id: string): Promise<boolean> {
  const { error, count } = await supabaseServer()
    .from('custom_matches')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw new Error(`customMatches.delete: ${error.message}`)
  return (count ?? 0) > 0
}
