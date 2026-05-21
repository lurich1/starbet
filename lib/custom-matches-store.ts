import path from 'path'
import { randomUUID } from 'crypto'
import type { Match } from '@/lib/types'
import { readJsonArray, writeJsonArray } from '@/lib/json-store'

const FILE = path.join(process.cwd(), 'data', 'custom-matches.json')

export async function readCustomMatches(): Promise<Match[]> {
  return readJsonArray<Match>(FILE)
}

export async function readCustomMatchesForSport(sport: string): Promise<Match[]> {
  const all = await readCustomMatches()
  const s = sport.toLowerCase()
  return all.filter((m) => (m.sport ?? 'football').toLowerCase() === s)
}

export async function addCustomMatch(
  input: Omit<Match, 'id' | 'custom'> & { sport: string },
): Promise<Match> {
  const all = await readCustomMatches()
  const match: Match = {
    ...input,
    id: `custom-${randomUUID()}`,
    custom: true,
  }
  all.unshift(match)
  await writeJsonArray(FILE, all)
  return match
}

export async function updateCustomMatch(
  id: string,
  patch: Partial<Match>,
): Promise<Match | null> {
  const all = await readCustomMatches()
  const idx = all.findIndex((m) => m.id === id)
  if (idx === -1) return null
  const { id: _id, custom: _custom, ...rest } = patch
  void _id
  void _custom
  const next: Match = { ...all[idx], ...rest, id: all[idx].id, custom: true }
  all[idx] = next
  await writeJsonArray(FILE, all)
  return next
}

export async function deleteCustomMatch(id: string): Promise<boolean> {
  const all = await readCustomMatches()
  const next = all.filter((m) => m.id !== id)
  if (next.length === all.length) return false
  await writeJsonArray(FILE, next)
  return true
}
