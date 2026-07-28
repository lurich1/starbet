'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Receipt,
  Trophy,
  Loader2,
  Radio,
  RefreshCw,
  Share2,
  Clock,
  CircleDot,
  ChevronUp,
  ChevronDown,
  Lock,
} from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { MeSubpageHeader } from '@/components/me-subpage-header'
import { Skeleton } from '@/components/ui/skeleton'
import { BetTicketDetails } from '@/components/bet-ticket-details'
import { getUserId, getUserName } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import { computeCashout } from '@/lib/cashout'
import type { PlacedBet, Match } from '@/lib/types'

type MainTab = 'open' | 'history'
type OpenFilter = 'all' | 'cashout' | 'live'

// Cash-out is locked during a match's early stage (first N minutes of play) and
// before kick-off, so a bet can't be cashed out the instant it's placed.
const EARLY_STAGE_MIN = 15

function parseElapsed(minute?: string): number | null {
  if (!minute) return null
  const m = /^(\d+)/.exec(minute)
  if (m) return parseInt(m[1], 10)
  if (minute === 'HT') return 45 // half-time is well past the early stage
  return null
}

// A bet's cash-out is locked while ANY of its matches hasn't kicked off yet or
// is still in its early stage. Once every match is live and past EARLY_STAGE_MIN
// (or at HT/2H), cash-out unlocks.
function isCashoutLocked(bet: PlacedBet, liveMatches: Record<string, Match>): boolean {
  return bet.selections.some((s) => {
    const m = liveMatches[s.matchId]
    if (!m || !m.isLive) return true // not started / not live yet → locked
    const elapsed = parseElapsed(m.minute)
    if (elapsed === null) return false // live but minute unknown → allow
    return elapsed < EARLY_STAGE_MIN // still in the early minutes → locked
  })
}

export default function BetHistoryPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [bets, setBets] = useState<PlacedBet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<MainTab>('open')
  const [openFilter, setOpenFilter] = useState<OpenFilter>('all')
  const [openBet, setOpenBet] = useState<PlacedBet | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [cashingId, setCashingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Ticks so the live cash-out value refreshes without a manual reload.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  // Current match states (keyed by id) so open bets can show live status/score,
  // since the selections stored on the bet are a placement-time snapshot.
  const [liveMatches, setLiveMatches] = useState<Record<string, Match>>({})
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/matches', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d?.matches) return
          const map: Record<string, Match> = {}
          for (const m of d.matches as Match[]) map[m.id] = m
          setLiveMatches(map)
        })
        .catch(() => {})
    void load()
    const t = setInterval(load, 20_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const handleCashOut = async (id: string) => {
    setCashingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/bets/${id}/cashout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: getUserId() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setBets((prev) => (prev ?? []).map((b) => (b.id === id ? (data.bet as PlacedBet) : b)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCashingId(null)
    }
  }

  useEffect(() => {
    const uid = getUserId()
    setUserId(uid)
    if (!uid) {
      setBets([])
      return
    }
    let cancelled = false
    void fetch(`/api/bets?userId=${uid}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`)))
      .then((data) => {
        if (cancelled) return
        setBets((data.bets ?? []) as PlacedBet[])
      })
      .catch((e) => !cancelled && setError(String(e)))
    // Only admins get the settle (Won/Lost) controls on open bets.
    void fetch('/api/admin/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { admin: false }))
      .then((d) => !cancelled && setIsAdmin(d?.admin === true))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleSettle = async (id: string, status: 'won' | 'lost') => {
    setSettlingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/bets/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setBets((prev) => (prev ?? []).map((b) => (b.id === id ? (data.bet as PlacedBet) : b)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSettlingId(null)
    }
  }

  // "Rebet" / share both hand back the booking code so it can be reloaded on
  // Home. Native share when available, clipboard otherwise.
  const shareCode = async (code: string) => {
    const text = `Load my Betfus slip with booking code ${code}.`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Betfus booking code', text })
      } else {
        await navigator.clipboard.writeText(code)
        setToast(`Code ${code} copied — paste it on Home to rebet.`)
        setTimeout(() => setToast(null), 2500)
      }
    } catch {
      /* user dismissed share */
    }
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-20 max-w-lg mx-auto w-full">
        <MeSubpageHeader title="My Bets" />
        <SignInGate />
        <MobileNav selectedBets={[]} activeTab="bets" />
      </div>
    )
  }

  const isBetLive = (b: PlacedBet) =>
    b.selections.some((s) => liveMatches[s.matchId]?.isLive)

  const all = bets ?? []
  const pending = all.filter((b) => b.status === 'pending')
  const settled = all.filter((b) => b.status !== 'pending')

  const openList =
    openFilter === 'cashout'
      ? pending.filter((b) => computeCashout(b, now) > 0 && !isCashoutLocked(b, liveMatches))
      : openFilter === 'live'
        ? pending.filter(isBetLive)
        : pending

  const list = tab === 'open' ? openList : settled

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 max-w-lg mx-auto w-full">
      <MeSubpageHeader title="My Bets" />

      {/* Main tabs: Open Bets / Bet History */}
      <div className="grid grid-cols-2 border-b border-border bg-card">
        <button
          onClick={() => setTab('open')}
          className={`relative py-3.5 text-sm font-bold transition-colors ${
            tab === 'open' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Open Bets ({pending.length})
          {tab === 'open' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`relative py-3.5 text-sm font-bold transition-colors ${
            tab === 'history' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Bet History
          {tab === 'history' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
        </button>
      </div>

      {/* Filter chips (open tab only) */}
      {tab === 'open' && (
        <div className="px-3 sm:px-4 pt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {([
            { key: 'all', label: 'All' },
            { key: 'cashout', label: 'Cashout Available' },
            { key: 'live', label: 'Live Games' },
          ] as { key: OpenFilter; label: string }[]).map((c) => (
            <button
              key={c.key}
              onClick={() => setOpenFilter(c.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                openFilter === c.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {toast && (
        <div className="px-3 sm:px-4 pt-3">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30 text-xs text-foreground font-medium">
            {toast}
          </div>
        </div>
      )}

      <main className="flex-1 px-3 sm:px-4 pt-3">
        {error ? (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium shadow-card">
            {error}
          </div>
        ) : bets === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-semibold text-sm text-foreground">
              {tab === 'open' ? 'No open bets' : 'No settled bets yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === 'open'
                ? 'Place a bet from the home page to see it here.'
                : 'Your won and lost bets will appear here.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {list.map((b) => (
              <BetCard
                key={b.id}
                bet={b}
                onOpen={() => setOpenBet(b)}
                onShare={() => shareCode(b.code)}
                isAdmin={isAdmin}
                settling={settlingId === b.id}
                onSettle={(status) => handleSettle(b.id, status)}
                cashoutValue={computeCashout(b, now)}
                cashoutLocked={isCashoutLocked(b, liveMatches)}
                cashingOut={cashingId === b.id}
                onCashOut={() => handleCashOut(b.id)}
                liveMatches={liveMatches}
              />
            ))}
          </ul>
        )}
      </main>

      <MobileNav selectedBets={[]} activeTab="bets" />

      {openBet && (
        <BetTicketDetails
          bet={openBet}
          open={!!openBet}
          onClose={() => setOpenBet(null)}
          userName={getUserName() ?? undefined}
        />
      )}
    </div>
  )
}

function BetCard({
  bet,
  onOpen,
  onShare,
  isAdmin = false,
  settling = false,
  onSettle,
  cashoutValue = 0,
  cashoutLocked = false,
  cashingOut = false,
  onCashOut,
  liveMatches = {},
}: {
  bet: PlacedBet
  onOpen: () => void
  onShare: () => void
  isAdmin?: boolean
  settling?: boolean
  onSettle?: (status: 'won' | 'lost') => void
  cashoutValue?: number
  cashoutLocked?: boolean
  cashingOut?: boolean
  onCashOut?: () => void
  liveMatches?: Record<string, Match>
}) {
  const [showDetails, setShowDetails] = useState(true)
  const isWon = bet.status === 'won'
  const isLost = bet.status === 'lost'
  const isPending = bet.status === 'pending'
  const isMultiple = bet.selections.length > 1
  const kind = isMultiple ? `Multiple (${bet.selections.length})` : 'Singles'
  const totalReturn = isWon ? (bet.payout ?? bet.potentialWin) : bet.potentialWin

  return (
    <li className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border/60">
        <span className="font-bold text-sm text-foreground">{kind}</span>
        <div className="flex items-center gap-3">
          {isPending && (
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:brightness-110"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rebet
            </button>
          )}
          {isWon && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-success/15 text-success">
              <Trophy className="w-3 h-3" /> Won
            </span>
          )}
          {isLost && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Lost
            </span>
          )}
          <button
            type="button"
            onClick={onShare}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Share booking code"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3.5">
        {/* Selections */}
        {showDetails && (
          <div className="space-y-3">
            {bet.selections.map((s) => {
              const lm = liveMatches[s.matchId]
              const live = !!lm?.isLive
              return (
                <div key={s.id}>
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-bold text-sm text-foreground">{s.outcomeLabel}</span>
                    <span className="text-sm font-bold text-foreground">@ {s.odds.toFixed(2)}</span>
                    <span className="text-[11px] text-muted-foreground">{s.marketLabel}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {s.match.homeTeam} <span className="opacity-60">vs</span> {s.match.awayTeam}
                    </span>
                    {live && (
                      <span className="inline-flex items-center gap-1 shrink-0 text-live font-bold">
                        <Radio className="w-2.5 h-2.5" />
                        {lm?.minute}
                        <span className="text-foreground tabular-nums">
                          {lm?.homeScore ?? 0}-{lm?.awayScore ?? 0}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground tabular-nums">
                    {new Date(bet.placedAt).toLocaleString(undefined, {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Details toggle */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-2 ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {showDetails ? 'Hide Match Details' : 'Show Match Details'}
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Stake / Pot. Win */}
        <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Stake</span>
            <span className="font-bold tabular-nums text-foreground">
              {formatMoney(bet.stake, bet.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{isWon ? 'Won' : 'Pot. Win'}</span>
            <span className={`font-bold tabular-nums ${isWon ? 'text-success' : 'text-foreground'}`}>
              {formatMoney(totalReturn, bet.currency)}
            </span>
          </div>
        </div>

        {/* Cashout — running bets only. Locked during the early stage. */}
        {isPending && onCashOut && cashoutValue > 0 && (
          cashoutLocked ? (
            <div className="mt-3 w-full h-12 rounded-lg bg-secondary border border-border text-muted-foreground font-semibold flex items-center justify-center gap-1.5 text-sm">
              <Lock className="w-3.5 h-3.5" />
              Cashout locked · opens after {EARLY_STAGE_MIN}&apos;
            </div>
          ) : (
            <button
              type="button"
              onClick={onCashOut}
              disabled={cashingOut}
              className="mt-3 w-full h-12 rounded-lg bg-success text-success-foreground font-bold flex items-center justify-center gap-1.5 hover:brightness-105 active:scale-[0.99] transition disabled:opacity-60"
            >
              {cashingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Cashout{' '}
                  <span className="tabular-nums">
                    {bet.currency} {formatMoney(cashoutValue, bet.currency)}
                  </span>
                </>
              )}
            </button>
          )
        )}

        {/* Admin-only settle controls for open bets */}
        {isAdmin && isPending && onSettle && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold shrink-0">
              Settle
            </span>
            <button
              type="button"
              onClick={() => onSettle('won')}
              disabled={settling}
              className="flex-1 h-8 rounded-md bg-success/10 border border-success/40 text-success text-xs font-bold hover:bg-success/20 disabled:opacity-50"
            >
              {settling ? '…' : 'Won'}
            </button>
            <button
              type="button"
              onClick={() => onSettle('lost')}
              disabled={settling}
              className="flex-1 h-8 rounded-md bg-destructive/10 border border-destructive/40 text-destructive text-xs font-bold hover:bg-destructive/20 disabled:opacity-50"
            >
              {settling ? '…' : 'Lost'}
            </button>
          </div>
        )}

        {/* Booking code + details link */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-mono tracking-wide">{bet.code}</span>
          <button type="button" onClick={onOpen} className="font-semibold hover:text-foreground">
            View full ticket
          </button>
        </div>
      </div>
    </li>
  )
}

function SignInGate() {
  return (
    <main className="flex-1 px-6 pt-12 pb-16 text-center max-w-sm mx-auto w-full">
      <div className="relative w-20 h-20 mx-auto mb-5">
        <div aria-hidden className="absolute inset-0 rounded-full bg-primary/15 blur-xl" />
        <div className="relative w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-card">
          <Receipt className="w-9 h-9 text-primary" />
        </div>
      </div>
      <h2 className="text-title font-bold mb-1.5">Sign in to view your bets</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Your bet history is private to your account.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="flex-1 h-12 inline-flex items-center justify-center rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary/10 transition-colors">Login</Link>
        <Link href="/register" className="flex-1 h-12 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-card hover:shadow-card-hover hover:-translate-y-0.5">Register</Link>
      </div>
    </main>
  )
}
