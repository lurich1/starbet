'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Check,
  Lock,
} from 'lucide-react'
import type { BetSelection, PlacedBet } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useBets } from '@/hooks/use-bets'
import { getUserId } from '@/lib/user-session'
import { getBettingState } from '@/lib/match-betting'
import { hydrateLegacySelection } from '@/lib/bet-slip-utils'
import { getCountryFlag } from '@/lib/country-flags'
import { BetTicketDetails } from '@/components/bet-ticket-details'

interface BetSlipPanelProps {
  selections: BetSelection[]
  onRemoveSelection: (selectionId: string) => void
  onClearAll: () => void
  onLoadSelections?: (selections: BetSelection[]) => void
  onPlaced?: () => void
}

type Tab = 'slip' | 'open' | 'settled'

const betTypeLabel = (n: number) => (n <= 1 ? 'Single' : `Multi (${n})`)

export function BetSlipPanel({
  selections,
  onRemoveSelection,
  onClearAll,
  onLoadSelections,
  onPlaced,
}: BetSlipPanelProps) {
  const [tab, setTab] = useState<Tab>('slip')
  const [stake, setStake] = useState('')
  const [betType, setBetType] = useState<'single' | 'multiple' | 'system'>('multiple')
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [currency, setCurrency] = useState('GHS')

  // Wallet balance/currency so the slip can show the balance and a deposit
  // shortfall prompt (mirrors the header's lookup).
  useEffect(() => {
    const id = getUserId()
    setUserId(id)
    if (!id) return
    let cancelled = false
    void fetch(`/api/users/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (cancelled || !u) return
        if (typeof u.balance === 'number') setBalance(u.balance)
        if (typeof u.currency === 'string') setCurrency(u.currency)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [bookingCode, setBookingCode] = useState('')
  const [loadingCode, setLoadingCode] = useState(false)
  const [booking, setBooking] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Trophy auto-pop: track which bet ids are currently pending so we can
  // detect when one flips to "won" between polls. We also remember which
  // bets we've already celebrated so reloads don't trigger the splash twice.
  const seenWonRef = useRef<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const [celebrationBet, setCelebrationBet] = useState<PlacedBet | null>(null)

  const { bets, placeBet, settleBet, removeBet, lookupCode, loading, error, errorCode, lastErrorCodeRef } =
    useBets()

  // The 24h deposit gate (server code 'deposit-required') pops a modal prompting
  // the user to top up before they can stake again, rather than a quiet inline note.
  const [depositPromptOpen, setDepositPromptOpen] = useState(false)
  useEffect(() => {
    if (errorCode === 'deposit-required') setDepositPromptOpen(true)
  }, [errorCode])
  // Deterministic check, read straight after a failed placeBet(): true when the
  // server blocked this stake on the deposit gate.
  const wasDepositBlocked = () => lastErrorCodeRef.current === 'deposit-required'

  // Watch for a pending → won transition and pop the trophy.
  useEffect(() => {
    for (const b of bets) {
      const wasPending = pendingIdsRef.current.has(b.id)
      if (b.status === 'won' && wasPending && !seenWonRef.current.has(b.id)) {
        seenWonRef.current.add(b.id)
        setCelebrationBet(b)
      }
    }
    pendingIdsRef.current = new Set(bets.filter((b) => b.status === 'pending').map((b) => b.id))
  }, [bets])

  const openBets = useMemo(() => bets.filter((b) => b.status === 'pending'), [bets])
  const settledBets = useMemo(() => bets.filter((b) => b.status !== 'pending'), [bets])

  const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1)
  const stakeNum = parseFloat(stake)
  const validStake = Number.isFinite(stakeNum) && stakeNum > 0
  // Single mode = each selection is its own bet at the entered stake.
  const isSingle = selections.length <= 1 || betType === 'single'
  const totalStakeAmount = isSingle ? stakeNum * selections.length : stakeNum
  const potentialWinNum = !validStake
    ? 0
    : isSingle
      ? selections.reduce((sum, sel) => sum + stakeNum * sel.odds, 0)
      : stakeNum * totalOdds
  const potentialWin = potentialWinNum.toFixed(2)
  const insufficient = validStake && balance !== null && totalStakeAmount > balance
  const shortfall = insufficient ? totalStakeAmount - (balance ?? 0) : 0

  const closedSelections = selections.filter((s) => getBettingState(s.match).closed)
  const hasClosed = closedSelections.length > 0

  const handlePlaceBet = async () => {
    setStatusMsg(null)
    if (selections.length === 0) {
      setStatusMsg({ kind: 'err', text: 'Add at least one selection.' })
      return
    }
    if (hasClosed) {
      setStatusMsg({
        kind: 'err',
        text: `Remove the ${closedSelections.length} closed selection${closedSelections.length > 1 ? 's' : ''} before placing.`,
      })
      return
    }
    if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
      setStatusMsg({ kind: 'err', text: 'Enter a stake amount.' })
      return
    }
    // Single mode with multiple picks: place each as its own bet.
    if (isSingle && selections.length > 1) {
      let placedCount = 0
      for (const sel of selections) {
        const p = await placeBet([sel], stakeNum)
        if (p) placedCount++
      }
      if (placedCount > 0) {
        setStatusMsg({ kind: 'ok', text: `${placedCount} single bet${placedCount > 1 ? 's' : ''} placed.` })
        setStake('')
        onClearAll()
        setTab('open')
        onPlaced?.()
      } else if (wasDepositBlocked()) {
        setDepositPromptOpen(true)
      } else {
        setStatusMsg({ kind: 'err', text: error ?? 'Could not place bets.' })
      }
      return
    }

    const placed = await placeBet(selections, stakeNum)
    if (placed) {
      setStatusMsg({
        kind: 'ok',
        text: `Bet placed — code ${placed.code} · potential win ${placed.potentialWin.toFixed(2)}`,
      })
      setStake('')
      onClearAll()
      setTab('open')
      onPlaced?.()
    } else if (wasDepositBlocked()) {
      setDepositPromptOpen(true)
    } else {
      setStatusMsg({ kind: 'err', text: error ?? 'Could not place bet.' })
    }
  }

  // Book Bet: save the current slip and hand back a shareable booking code that
  // anyone can load into their own slip via "Have a booking code?".
  const handleBookBet = async () => {
    setStatusMsg(null)
    if (selections.length === 0) {
      setStatusMsg({ kind: 'err', text: 'Add at least one selection.' })
      return
    }
    setBooking(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.code) {
        throw new Error(data.error ?? 'Could not create a booking code.')
      }
      const code = data.code as string
      const shareText = `Load my Star Bet slip with booking code ${code}.`
      // Best-effort copy so the code is on the clipboard even if share is cancelled.
      try {
        await navigator.clipboard?.writeText(code)
      } catch {
        /* clipboard blocked — the code is still shown below */
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: 'Star Bet booking code', text: shareText })
        } catch {
          /* share cancelled — code already copied */
        }
      }
      setStatusMsg({
        kind: 'ok',
        text: `Booking code ${code} created and copied. Share it — anyone can load these selections.`,
      })
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Could not create a booking code.',
      })
    } finally {
      setBooking(false)
    }
  }

  const handleLoadCode = async () => {
    setStatusMsg(null)
    const code = bookingCode.trim().toUpperCase()
    if (code.length < 4) {
      setStatusMsg({ kind: 'err', text: 'Enter a booking code.' })
      return
    }
    setLoadingCode(true)
    const bet = await lookupCode(code)
    setLoadingCode(false)
    if (!bet) {
      setStatusMsg({ kind: 'err', text: error ?? 'Code not found.' })
      return
    }
    if (!onLoadSelections) {
      setStatusMsg({ kind: 'err', text: 'Cannot load selections from this view.' })
      return
    }
    onLoadSelections(bet.selections)
    setBookingCode('')
    setStatusMsg({
      kind: 'ok',
      text: `Loaded ${bet.selections.length} selection${bet.selections.length > 1 ? 's' : ''} from ${bet.code}.`,
    })
    setTab('slip')
  }

  return (
    <div className="p-4">
      {/* Auto-pop the trophy whenever a bet flips pending → won. */}
      {celebrationBet && (
        <BetTicketDetails
          bet={celebrationBet}
          open={true}
          onClose={() => setCelebrationBet(null)}
        />
      )}

      {/* 24h deposit gate: prompt the user to top up before they can stake again. */}
      <Dialog open={depositPromptOpen} onOpenChange={setDepositPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Bet submission failed
            </DialogTitle>
            <DialogDescription>
              A new deposit is required before this bet can be placed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositPromptOpen(false)}>
              Not now
            </Button>
            <Button asChild className="font-bold">
              <Link href={userId ? `/users/first-deposit?userId=${userId}` : '/register'}>
                Deposit now
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex border-b border-border text-sm">
        <TabButton active={tab === 'slip'} onClick={() => setTab('slip')}>
          Bet Slip{selections.length > 0 ? ` (${selections.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'open'} onClick={() => setTab('open')}>
          Open{openBets.length > 0 ? ` (${openBets.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'settled'} onClick={() => setTab('settled')}>
          Settled{settledBets.length > 0 ? ` (${settledBets.length})` : ''}
        </TabButton>
      </div>
      {tab === 'slip' && (
        <div className="mt-4">
          {selections.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-secondary rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">No selections yet.</p>
              <p className="text-muted-foreground text-xs mt-1">Click an odd to add it.</p>
            </div>
          ) : (
            <>
              {/* Header: count badge + remove all + balance */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-success text-white text-xs font-extrabold flex items-center justify-center tabular-nums">
                    {selections.length}
                  </span>
                  <button
                    onClick={onClearAll}
                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove All
                  </button>
                </div>
                <span className="text-sm font-extrabold text-amber-400 tabular-nums">
                  {currency} {balance !== null ? balance.toFixed(2) : '—'}
                </span>
              </div>

              {/* Bet-type segmented control */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-secondary rounded-xl mb-3">
                {(['single', 'multiple', 'system'] as const).map((t) => {
                  const disabled = t === 'system' || (t === 'multiple' && selections.length < 2)
                  const activeT = (isSingle ? 'single' : betType) === t
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={disabled}
                      onClick={() => setBetType(t)}
                      className={`py-2 rounded-lg text-sm font-bold capitalize transition-colors ${
                        activeT
                          ? 'bg-primary text-primary-foreground shadow'
                          : disabled
                            ? 'text-muted-foreground/40 cursor-not-allowed'
                            : 'text-muted-foreground hover:text-foreground cursor-pointer'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>

              {/* Selection rows */}
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {selections.map((raw) => {
                  const selection = hydrateLegacySelection(raw)
                  const sClosed = getBettingState(selection.match).closed
                  const live = selection.match.isLive
                  return (
                    <div key={selection.id} className={`flex items-start gap-2.5 p-3 bg-card ${sClosed ? 'bg-destructive/5' : ''}`}>
                      <button
                        onClick={() => onRemoveSelection(selection.id)}
                        className="mt-0.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
                        aria-label="Remove selection"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-sm truncate">{selection.outcomeLabel}</p>
                          <span className={`font-extrabold tabular-nums shrink-0 ${sClosed ? 'text-muted-foreground line-through' : 'text-primary'}`}>
                            {selection.odds.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                          {live && <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-live/15 text-live shrink-0">Live</span>}
                          {sClosed && <Lock className="w-3 h-3 text-destructive shrink-0" />}
                          <span className="truncate">{selection.match.homeTeam} v {selection.match.awayTeam}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5">{selection.marketLabel}</p>
                        {sClosed && <p className="text-[10px] text-destructive mt-1">Closed — remove this leg.</p>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Total stake */}
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm font-bold">Total Stake</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">{currency}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    className={`w-28 text-right bg-secondary font-bold tabular-nums ${
                      insufficient ? 'border-destructive ring-1 ring-destructive/60' : 'border-border'
                    }`}
                  />
                </div>
              </div>

              {insufficient && (
                <div className="mt-1.5 text-right">
                  <p className="text-xs text-destructive">
                    You need a balance of {currency} {totalStakeAmount.toFixed(2)} to place this bet. Please
                    deposit an additional {currency} {shortfall.toFixed(2)}.
                  </p>
                  <Link
                    href={userId ? `/users/first-deposit?userId=${userId}` : '/register'}
                    className="mt-1 inline-flex items-center gap-0.5 text-xs font-bold text-success hover:underline"
                  >
                    Go to Deposit <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {/* Totals */}
              <div className="mt-3 rounded-xl bg-secondary p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Odds</span>
                  <span className="font-bold tabular-nums">{isSingle ? '—' : totalOdds.toFixed(2)}</span>
                </div>
                {isSingle && selections.length > 1 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Stake</span>
                    <span className="font-bold tabular-nums">{validStake ? totalStakeAmount.toFixed(2) : '0.00'}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
                  <span className="text-sm font-bold">Potential Win</span>
                  <span className="text-lg font-extrabold text-success tabular-nums">{potentialWin}</span>
                </div>
              </div>

              {statusMsg && (
                <div
                  className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
                    statusMsg.kind === 'ok'
                      ? 'bg-success/10 border border-success/20 text-success'
                      : 'bg-destructive/10 border border-destructive/20 text-destructive'
                  }`}
                >
                  {statusMsg.kind === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <span>{statusMsg.text}</span>
                </div>
              )}

              {/* Action bar: Book Bet | Place Bet */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={handleBookBet}
                  disabled={loading || booking}
                  className="h-12 border-primary/40 text-primary hover:bg-primary/10 font-bold"
                >
                  {booking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Booking…
                    </>
                  ) : (
                    'Book Bet'
                  )}
                </Button>
                <Button
                  onClick={handlePlaceBet}
                  disabled={loading || hasClosed || insufficient}
                  className="h-12 bg-success text-white hover:bg-success/90 font-bold shadow-lg shadow-success/20 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Placing…
                    </>
                  ) : (
                    'Place Bet'
                  )}
                </Button>
              </div>
            </>
          )}

          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground font-semibold uppercase mb-3">
              Have a booking code?
            </p>
            <Input
              placeholder="E.G. AKD7M9"
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLoadCode()
              }}
              maxLength={8}
              className="bg-secondary border-border uppercase tracking-widest"
            />
            <Button
              variant="outline"
              onClick={() => void handleLoadCode()}
              disabled={loadingCode || !bookingCode}
              className="w-full mt-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              {loadingCode ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
                </>
              ) : (
                'LOAD'
              )}
            </Button>
          </div>
        </div>
      )}

      {tab === 'open' && (
        <BetHistory
          mode="open"
          bets={openBets}
          allBets={bets}
          onSettle={(id, status) => void settleBet(id, status)}
          onDelete={(id) => void removeBet(id)}
        />
      )}

      {tab === 'settled' && (
        <BetHistory
          mode="settled"
          bets={settledBets}
          allBets={bets}
          onSettle={(id, status) => void settleBet(id, status)}
          onDelete={(id) => void removeBet(id)}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 font-semibold transition-colors text-sm sm:text-base ${
        active
          ? 'text-primary border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

type SettledFilter = 'all' | 'won' | 'lost'

interface BetHistoryProps {
  mode: 'open' | 'settled'
  bets: PlacedBet[]
  allBets: PlacedBet[]
  onSettle: (id: string, status: 'won' | 'lost') => void
  onDelete: (id: string) => void
}

function BetHistory({ mode, bets, allBets, onSettle, onDelete }: BetHistoryProps) {
  const [filter, setFilter] = useState<SettledFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Stats are computed across ALL bets so the summary reflects total history regardless of tab.
  const stats = useMemo(() => {
    const won = allBets.filter((b) => b.status === 'won').length
    const lost = allBets.filter((b) => b.status === 'lost').length
    const pending = allBets.filter((b) => b.status === 'pending').length
    const totalStake = allBets.reduce((s, b) => s + b.stake, 0)
    const totalReturns = allBets
      .filter((b) => b.status === 'won')
      .reduce((s, b) => s + (b.payout ?? b.potentialWin), 0)
    const settledStake = allBets
      .filter((b) => b.status !== 'pending')
      .reduce((s, b) => s + b.stake, 0)
    const netPL = totalReturns - settledStake
    const settled = won + lost
    const winRate = settled > 0 ? Math.round((won / settled) * 100) : 0
    const pendingStake = allBets
      .filter((b) => b.status === 'pending')
      .reduce((s, b) => s + b.stake, 0)
    return { won, lost, pending, totalStake, totalReturns, netPL, winRate, pendingStake }
  }, [allBets])

  const filtered = useMemo(() => {
    if (mode === 'open') return bets
    if (filter === 'all') return bets
    return bets.filter((b) => b.status === filter)
  }, [bets, mode, filter])

  if (bets.length === 0 && allBets.length === 0) {
    return (
      <div className="mt-4 text-center py-12">
        <p className="text-muted-foreground text-sm">No bets placed yet.</p>
        <p className="text-muted-foreground text-xs mt-1">
          Add selections to your slip and place a bet to start your history.
        </p>
      </div>
    )
  }

  const statsCard =
    mode === 'open' ? (
      <div className="bg-secondary rounded-lg p-3 grid grid-cols-2 gap-3">
        <Stat label="Open bets" value={String(stats.pending)} />
        <Stat label="At stake" value={stats.pendingStake.toFixed(2)} />
      </div>
    ) : (
      <div className="bg-secondary rounded-lg p-3 grid grid-cols-2 gap-3">
        <Stat label="Win rate" value={`${stats.winRate}%`} sub={`${stats.won}W / ${stats.lost}L`} />
        <Stat
          label="Net P&L"
          value={(stats.netPL >= 0 ? '+' : '') + stats.netPL.toFixed(2)}
          tone={stats.netPL > 0 ? 'good' : stats.netPL < 0 ? 'bad' : 'neutral'}
        />
        <Stat label="Total staked" value={stats.totalStake.toFixed(2)} />
        <Stat label="Total returns" value={stats.totalReturns.toFixed(2)} tone="good" />
      </div>
    )

  return (
    <div className="mt-4 space-y-3">
      {statsCard}

      {mode === 'settled' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <FilterPill
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="All"
            count={stats.won + stats.lost}
          />
          <FilterPill
            active={filter === 'won'}
            onClick={() => setFilter('won')}
            label="Won"
            count={stats.won}
          />
          <FilterPill
            active={filter === 'lost'}
            onClick={() => setFilter('lost')}
            label="Lost"
            count={stats.lost}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">
          {mode === 'open' ? 'No open bets.' : 'No settled bets yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((bet) => (
            <BetCard
              key={bet.id}
              bet={bet}
              expanded={expanded.has(bet.id)}
              onToggle={() => toggleExpand(bet.id)}
              onSettle={(status) => onSettle(bet.id, status)}
              onDelete={() => onDelete(bet.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? 'text-success'
      : tone === 'bad'
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:text-foreground'
      }`}
    >
      {label} {count > 0 && <span className="opacity-75">({count})</span>}
    </button>
  )
}

interface BetCardProps {
  bet: PlacedBet
  expanded: boolean
  onToggle: () => void
  onSettle: (status: 'won' | 'lost') => void
  onDelete: () => void
}

function BetCard({ bet, expanded, onToggle, onSettle, onDelete }: BetCardProps) {
  const [copied, setCopied] = useState(false)
  const [ticketOpen, setTicketOpen] = useState(false)

  const statusColor =
    bet.status === 'won'
      ? 'bg-success/15 text-success border-success/30'
      : bet.status === 'lost'
        ? 'bg-destructive/15 text-destructive border-destructive/30'
        : 'bg-muted text-muted-foreground border-border'

  const payout =
    bet.status === 'won' ? (bet.payout ?? bet.potentialWin) : bet.status === 'lost' ? 0 : null

  const copyCode = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(bet.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="bg-secondary rounded-lg overflow-hidden">
      <BetTicketDetails
        bet={bet}
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
      />
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-secondary/80 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 text-left">
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColor}`}
          >
            {bet.status}
          </span>
          <span className="text-[11px] font-semibold text-foreground shrink-0">
            {betTypeLabel(bet.selections.length)}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            · {new Date(bet.placedAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-bold tabular-nums">
            {bet.totalOdds.toFixed(2)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
          <div className="pt-3 flex items-center justify-between gap-2 bg-background/50 -mx-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Booking code
              </p>
              <p className="font-mono text-base font-bold tracking-widest text-primary">
                {bet.code}
              </p>
            </div>
            <button
              onClick={copyCode}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs font-medium border border-border transition-colors"
              aria-label="Copy booking code"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span className="text-success">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-3 space-y-1.5">
            {bet.selections.map((raw) => {
              const s = hydrateLegacySelection(raw)
              const legStatus = s.status ?? 'pending'
              // Sportybet-style: each leg coloured by its own result
              const legClasses =
                legStatus === 'won'
                  ? 'border-l-2 border-success bg-success/10 pl-2'
                  : legStatus === 'lost'
                    ? 'border-l-2 border-destructive bg-destructive/10 pl-2'
                    : 'border-l-2 border-transparent pl-2'
              const teamColor =
                legStatus === 'won'
                  ? 'text-success'
                  : legStatus === 'lost'
                    ? 'text-destructive'
                    : 'text-foreground'
              return (
                <div key={s.id} className={`text-xs py-1 rounded-r ${legClasses}`}>
                  <div className="flex justify-between gap-2">
                    <span className={`truncate font-medium ${teamColor}`}>
                      {s.match.homeTeam} vs {s.match.awayTeam}
                      {legStatus === 'won' && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase">✓</span>
                      )}
                      {legStatus === 'lost' && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase">✗</span>
                      )}
                    </span>
                    <span className="font-semibold text-primary shrink-0 tabular-nums">
                      {s.odds.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                    <span aria-hidden className="shrink-0">{getCountryFlag(s.match.country)}</span>
                    <span className="truncate">
                      {s.marketLabel}: {s.outcomeLabel} · {s.match.league}
                    </span>
                  </p>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-xs">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Stake</p>
              <p className="font-bold tabular-nums">{bet.stake.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">
                {bet.status === 'pending' ? 'To win' : bet.status === 'won' ? 'Won' : 'Lost'}
              </p>
              <p
                className={`font-bold tabular-nums ${
                  bet.status === 'won'
                    ? 'text-success'
                    : bet.status === 'lost'
                      ? 'text-destructive'
                      : 'text-foreground'
                }`}
              >
                {bet.status === 'pending'
                  ? bet.potentialWin.toFixed(2)
                  : payout !== null
                    ? payout.toFixed(2)
                    : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">P&amp;L</p>
              <p
                className={`font-bold tabular-nums ${
                  bet.status === 'won'
                    ? 'text-success'
                    : bet.status === 'lost'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                }`}
              >
                {bet.status === 'pending'
                  ? '—'
                  : bet.status === 'won'
                    ? `+${(bet.potentialWin - bet.stake).toFixed(2)}`
                    : `-${bet.stake.toFixed(2)}`}
              </p>
            </div>
          </div>

          {bet.settledAt && (
            <p className="text-[11px] text-muted-foreground">
              Settled {new Date(bet.settledAt).toLocaleString()}
            </p>
          )}

          {bet.status !== 'pending' && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setTicketOpen(true)
              }}
              className={`w-full text-xs ${
                bet.status === 'won'
                  ? 'border-success text-success hover:bg-success/10'
                  : 'border-muted-foreground/40 text-muted-foreground hover:bg-secondary'
              }`}
            >
              View Ticket
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
