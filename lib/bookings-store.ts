// "Book Bet" codes: a saved slip (selections only) with a short shareable code.
// Separate from placed bets — no stake, no user, never settled. Someone loads a
// code to copy the selections into their own slip.

import { randomInt } from 'crypto'
import type { BetSelection } from '@/lib/types'
import { supabaseServer } from '@/lib/supabase'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(length = 6): string {
  let s = ''
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  return s
}

/** A code must be unique across BOTH bets and bookings (shared code namespace). */
async function codeTaken(code: string): Promise<boolean> {
  const sb = supabaseServer()
  const [betRes, bookingRes] = await Promise.all([
    sb.from('bets').select('id').eq('code', code).maybeSingle(),
    sb.from('bookings').select('id').eq('code', code).maybeSingle(),
  ])
  if (betRes.error) throw new Error(`bookings.codeTaken(bets): ${betRes.error.message}`)
  if (bookingRes.error) throw new Error(`bookings.codeTaken(bookings): ${bookingRes.error.message}`)
  return !!betRes.data || !!bookingRes.data
}

export async function createBooking(selections: BetSelection[]): Promise<{ code: string }> {
  let code = generateCode(8)
  for (let i = 0; i < 20; i++) {
    const candidate = generateCode()
    if (!(await codeTaken(candidate))) {
      code = candidate
      break
    }
  }
  const { error } = await supabaseServer().from('bookings').insert({ code, selections })
  if (error) throw new Error(`bookings.create: ${error.message}`)
  return { code }
}

export async function findBookingByCode(code: string): Promise<BetSelection[] | null> {
  const upper = code.trim().toUpperCase()
  const { data, error } = await supabaseServer()
    .from('bookings')
    .select('selections')
    .eq('code', upper)
    .maybeSingle()
  if (error) {
    // 42P01 = undefined_table: migration 0014 not applied yet. Degrade to "not
    // found" so placed-bet code lookups and invalid codes still behave cleanly.
    if ((error as { code?: string }).code === '42P01') return null
    throw new Error(`bookings.findByCode: ${error.message}`)
  }
  if (!data) return null
  return (data.selections as BetSelection[]) ?? []
}
