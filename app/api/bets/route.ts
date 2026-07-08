import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import {
  readBets,
  readBetsForUser,
  addBet,
  findBetByCode,
  generateUniqueCode,
} from '@/lib/bets-store'
import { findBookingByCode } from '@/lib/bookings-store'
import { creditBalance, debitBalance, findUserById } from '@/lib/users-store'
import { checkRecentDeposit, DEPOSIT_REQUIRED_MESSAGE } from '@/lib/deposit-gate'
import { ADMIN_COOKIE, isValidSessionCookie } from '@/lib/admin-auth'
import type { BetSelection, PlacedBet } from '@/lib/types'

async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies()
  const value = store.get(ADMIN_COOKIE)?.value
  return isValidSessionCookie(value)
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const userId = searchParams.get('userId')?.trim() || null

  // Looking up a bet by code is fine for anyone who knows the code — that's
  // how betting shops settle tickets across counters.
  if (code) {
    const bet = await findBetByCode(code)
    if (bet) {
      return NextResponse.json({ bet })
    }
    // Fall back to a "Book Bet" booking code (saved slip, no stake/user). Return
    // it in the same `{ bet }` shape so the client loads its selections normally.
    const bookingSelections = await findBookingByCode(code)
    if (bookingSelections) {
      const upper = code.trim().toUpperCase()
      const totalOdds = bookingSelections.reduce((acc, s) => acc * Number(s.odds || 1), 1)
      return NextResponse.json({
        bet: {
          id: `booking-${upper}`,
          code: upper,
          placedAt: new Date().toISOString(),
          stake: 0,
          totalOdds: Number.isFinite(totalOdds) ? +totalOdds.toFixed(4) : 1,
          potentialWin: 0,
          status: 'pending',
          selections: bookingSelections,
          isBooking: true,
        },
      })
    }
    return NextResponse.json({ error: 'code not found' }, { status: 404 })
  }

  // A user can list THEIR OWN bets by passing their userId.
  if (userId) {
    const bets = await readBetsForUser(userId)
    return NextResponse.json({ bets })
  }

  // Listing every bet on the platform is admin-only — players can never see
  // someone else's slips or stakes.
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: 'unauthorized — list-all is admin-only' },
      { status: 401 },
    )
  }

  const bets = await readBets()
  return NextResponse.json({ bets })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { selections, stake, userId } = body as {
    selections?: BetSelection[]
    stake?: number
    userId?: string
  }

  if (!Array.isArray(selections) || selections.length === 0) {
    return NextResponse.json({ error: 'no selections' }, { status: 400 })
  }
  const stakeNum = typeof stake === 'number' ? stake : Number(stake)
  if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
    return NextResponse.json({ error: 'invalid stake' }, { status: 400 })
  }
  const cleanUserId = (userId ?? '').trim()
  if (!cleanUserId) {
    return NextResponse.json(
      { error: 'Please sign in to place a bet.' },
      { status: 401 },
    )
  }

  const totalOdds = selections.reduce((acc, s) => acc * Number(s.odds || 0), 1)
  if (!Number.isFinite(totalOdds) || totalOdds <= 0) {
    return NextResponse.json({ error: 'invalid odds' }, { status: 400 })
  }

  // Look up the user first so we can stamp the bet with their wallet currency.
  const userBefore = await findUserById(cleanUserId)
  if (!userBefore) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // 24h stake gate: a player must have deposited within the last 24 hours to
  // place a bet, so they can't just keep recycling their existing balance.
  const gate = await checkRecentDeposit(cleanUserId)
  if (!gate.allowed) {
    return NextResponse.json(
      { error: DEPOSIT_REQUIRED_MESSAGE, code: 'deposit-required' },
      { status: 402 },
    )
  }

  // Atomically pull the stake off the user's balance before persisting the
  // bet. If balance is too low, reject with a clear message.
  const debit = await debitBalance(cleanUserId, stakeNum)
  if ('error' in debit) {
    if (debit.error === 'not-found') {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }
    return NextResponse.json(
      { error: 'Add funds to your wallet to place this bet.' },
      { status: 402 },
    )
  }

  const bet: PlacedBet = {
    id: randomUUID(),
    code: await generateUniqueCode(),
    userId: cleanUserId,
    placedAt: new Date().toISOString(),
    stake: stakeNum,
    totalOdds: +totalOdds.toFixed(4),
    potentialWin: +(stakeNum * totalOdds).toFixed(2),
    currency: userBefore.currency,
    status: 'pending',
    selections,
  }

  try {
    await addBet(bet)
  } catch (err) {
    // Refund the stake — the debit already happened, so credit it back
    await creditBalance(cleanUserId, stakeNum).catch(() => null)
    throw err
  }
  return NextResponse.json(
    { bet, balance: debit.user.balance },
    { status: 201 },
  )
}
