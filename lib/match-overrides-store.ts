import { supabaseServer } from '@/lib/supabase'

export interface MatchOverride {
  matchId: string
  homeScore: number | null
  awayScore: number | null
  minute: string | null
  isLive: boolean | null
  locked: boolean
  updatedAt: string
}

interface MatchOverrideRow {
  match_id: string
  home_score: number | null
  away_score: number | null
  minute: string | null
  is_live: boolean | null
  locked: boolean
  updated_at: string
}

function rowToOverride(row: MatchOverrideRow): MatchOverride {
  return {
    matchId: row.match_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
    minute: row.minute,
    isLive: row.is_live,
    locked: row.locked,
    updatedAt: row.updated_at,
  }
}

export async function readMatchOverrides(): Promise<MatchOverride[]> {
  const { data, error } = await supabaseServer()
    .from('match_overrides')
    .select('*')
  if (error) throw new Error(`matchOverrides.readAll: ${error.message}`)
  return ((data ?? []) as MatchOverrideRow[]).map(rowToOverride)
}

/** Map of matchId → override, for fast lookup during merge. */
export async function readMatchOverridesMap(): Promise<Map<string, MatchOverride>> {
  const list = await readMatchOverrides()
  return new Map(list.map((o) => [o.matchId, o]))
}

export async function getMatchOverride(matchId: string): Promise<MatchOverride | null> {
  const { data, error } = await supabaseServer()
    .from('match_overrides')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle()
  if (error) throw new Error(`matchOverrides.get: ${error.message}`)
  return data ? rowToOverride(data as MatchOverrideRow) : null
}

export interface MatchOverridePatch {
  homeScore?: number | null
  awayScore?: number | null
  minute?: string | null
  isLive?: boolean | null
  locked?: boolean
}

export async function upsertMatchOverride(
  matchId: string,
  patch: MatchOverridePatch,
): Promise<MatchOverride> {
  const row: Record<string, unknown> = { match_id: matchId, updated_at: new Date().toISOString() }
  if (patch.homeScore !== undefined) row.home_score = patch.homeScore
  if (patch.awayScore !== undefined) row.away_score = patch.awayScore
  if (patch.minute !== undefined) row.minute = patch.minute
  if (patch.isLive !== undefined) row.is_live = patch.isLive
  if (patch.locked !== undefined) row.locked = patch.locked

  const { data, error } = await supabaseServer()
    .from('match_overrides')
    .upsert(row, { onConflict: 'match_id' })
    .select('*')
    .single()
  if (error) throw new Error(`matchOverrides.upsert: ${error.message}`)
  return rowToOverride(data as MatchOverrideRow)
}

export async function deleteMatchOverride(matchId: string): Promise<boolean> {
  const { error, count } = await supabaseServer()
    .from('match_overrides')
    .delete({ count: 'exact' })
    .eq('match_id', matchId)
  if (error) throw new Error(`matchOverrides.delete: ${error.message}`)
  return (count ?? 0) > 0
}
