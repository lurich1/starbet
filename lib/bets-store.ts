import path from 'path'
import { randomInt } from 'crypto'
import type { PlacedBet } from '@/lib/types'
import { readJsonArray, writeJsonArray } from '@/lib/json-store'

export type { PlacedBet }

// Avoid visually-confusing chars (0, O, 1, I, L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const BETS_FILE = path.join(process.cwd(), 'data', 'bets.json')

function generateCode(length = 6): string {
  let s = ''
  for (let i = 0; i < length; i++) {
    s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  }
  return s
}

export async function generateUniqueCode(): Promise<string> {
  const existing = new Set((await readBets()).map((b) => b.code))
  for (let i = 0; i < 20; i++) {
    const code = generateCode()
    if (!existing.has(code)) return code
  }
  return generateCode(8)
}

export async function findBetByCode(code: string): Promise<PlacedBet | null> {
  const all = await readBets()
  const upper = code.toUpperCase()
  return all.find((b) => b.code === upper) ?? null
}

export async function readBets(): Promise<PlacedBet[]> {
  const bets = await readJsonArray<PlacedBet>(BETS_FILE)

  // Backfill missing booking codes (for bets placed before the code field existed)
  let mutated = false
  const used = new Set<string>()
  for (const b of bets) {
    if (b.code) used.add(b.code)
  }
  for (const b of bets) {
    if (!b.code) {
      let code = ''
      do {
        code = generateCode()
      } while (used.has(code))
      used.add(code)
      b.code = code
      mutated = true
    }
  }
  if (mutated) {
    await writeJsonArray(BETS_FILE, bets)
  }
  return bets
}

export async function addBet(bet: PlacedBet): Promise<void> {
  const all = await readBets()
  all.unshift(bet)
  await writeJsonArray(BETS_FILE, all.slice(0, 200))
}

export async function updateBet(
  id: string,
  patch: Partial<Pick<PlacedBet, 'status' | 'settledAt' | 'payout'>>,
): Promise<PlacedBet | null> {
  const all = await readBets()
  const idx = all.findIndex((b) => b.id === id)
  if (idx === -1) return null
  const updated: PlacedBet = { ...all[idx], ...patch }
  all[idx] = updated
  await writeJsonArray(BETS_FILE, all)
  return updated
}

export async function deleteBet(id: string): Promise<boolean> {
  const all = await readBets()
  const next = all.filter((b) => b.id !== id)
  if (next.length === all.length) return false
  await writeJsonArray(BETS_FILE, next)
  return true
}
