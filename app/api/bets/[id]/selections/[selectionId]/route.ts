import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { creditBalance } from '@/lib/users-store'
import { supabaseServer } from '@/lib/supabase'
import { ADMIN_COOKIE, isValidSessionCookie } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string; selectionId: string }>
}

async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies()
  const value = store.get(ADMIN_COOKIE)?.value
  return isValidSessionCookie(value)
}

/**
 * Per-leg settlement. Admin marks one selection won / lost / pending and the
 * parent bet auto-settles:
 *   - any selection lost  → bet is lost (stake stays gone)
 *   - all selections won  → bet is won, user credited with potential_win
 *   - otherwise           → bet stays pending
 *
 * Already-settled bets are locked.
 */
export async function PATCH(request: Request, { params }: Params) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id: betId, selectionId } = await params

  let body: { status?: 'pending' | 'won' | 'lost' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const next = body.status
  if (next !== 'pending' && next !== 'won' && next !== 'lost') {
    return NextResponse.json(
      { error: 'status must be pending, won, or lost' },
      { status: 400 },
    )
  }

  // Lock check on the parent bet.
  const { data: bet, error: betErr } = await supabaseServer()
    .from('bets')
    .select('id, status, user_id, potential_win')
    .eq('id', betId)
    .maybeSingle()
  if (betErr) return NextResponse.json({ error: betErr.message }, { status: 500 })
  if (!bet) return NextResponse.json({ error: 'bet not found' }, { status: 404 })
  if (bet.status !== 'pending') {
    return NextResponse.json(
      { error: `bet is ${bet.status} and locked — settled bets cannot be changed` },
      { status: 409 },
    )
  }

  // Update the single selection.
  const { error: updErr } = await supabaseServer()
    .from('bet_selections')
    .update({ status: next })
    .eq('id', selectionId)
    .eq('bet_id', betId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Re-derive parent status from the full set of selections.
  const { data: legs, error: legsErr } = await supabaseServer()
    .from('bet_selections')
    .select('status')
    .eq('bet_id', betId)
  if (legsErr) return NextResponse.json({ error: legsErr.message }, { status: 500 })

  const all = (legs ?? []) as { status: 'pending' | 'won' | 'lost' }[]
  let derived: 'pending' | 'won' | 'lost' = 'pending'
  if (all.some((l) => l.status === 'lost')) derived = 'lost'
  else if (all.length > 0 && all.every((l) => l.status === 'won')) derived = 'won'

  // If the bet should auto-settle, apply it and pay out if won.
  if (derived !== 'pending') {
    const settledAt = new Date().toISOString()
    const payout = derived === 'won' ? Number(bet.potential_win) : 0
    const { error: betUpdErr } = await supabaseServer()
      .from('bets')
      .update({ status: derived, settled_at: settledAt, payout })
      .eq('id', betId)
    if (betUpdErr) return NextResponse.json({ error: betUpdErr.message }, { status: 500 })

    if (derived === 'won' && bet.user_id) {
      await creditBalance(bet.user_id, payout)
    }
  }

  return NextResponse.json({
    selectionId,
    selectionStatus: next,
    betStatus: derived,
  })
}
