import { NextResponse } from 'next/server'
import { createBooking } from '@/lib/bookings-store'
import type { BetSelection } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Create a shareable booking code from the current slip. No auth / stake needed
// — a booking is just saved selections anyone can load.
export async function POST(request: Request) {
  let body: { selections?: BetSelection[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const selections = body.selections
  if (!Array.isArray(selections) || selections.length === 0) {
    return NextResponse.json({ error: 'Add at least one selection to book.' }, { status: 400 })
  }
  if (selections.length > 40) {
    return NextResponse.json({ error: 'Too many selections.' }, { status: 400 })
  }

  try {
    const { code } = await createBooking(selections)
    return NextResponse.json({ code }, { status: 201 })
  } catch (e) {
    console.error('[bookings] create failed:', e)
    return NextResponse.json(
      { error: 'Could not create a booking code. Please try again.' },
      { status: 500 },
    )
  }
}
