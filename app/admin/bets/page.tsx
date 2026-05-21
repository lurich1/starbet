'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  Lock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PlacedBet } from '@/lib/types'
import { getCountryFlag } from '@/lib/country-flags'

type StatusFilter = 'all' | 'pending' | 'won' | 'lost'

export default function AdminBetsPage() {
  const [bets, setBets] = useState<PlacedBet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = async () => {
    try {
      const res = await fetch('/api/bets', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { bets: PlacedBet[] }
      setBets(data.bets)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    return bets.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false
      if (q) {
        if (b.code.includes(q)) return true
        const hit = b.selections.some(
          (s) =>
            s.match.homeTeam.toUpperCase().includes(q) ||
            s.match.awayTeam.toUpperCase().includes(q) ||
            s.match.league.toUpperCase().includes(q),
        )
        if (!hit) return false
      }
      return true
    })
  }, [bets, filter, search])

  const counts = useMemo(() => {
    return {
      all: bets.length,
      pending: bets.filter((b) => b.status === 'pending').length,
      won: bets.filter((b) => b.status === 'won').length,
      lost: bets.filter((b) => b.status === 'lost').length,
    }
  }, [bets])

  const setBusyFor = (id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSettle = async (id: string, status: 'won' | 'lost') => {
    setBusyFor(id, true)
    try {
      const res = await fetch(`/api/bets/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { bet: PlacedBet }
      setBets((prev) => prev.map((b) => (b.id === id ? data.bet : b)))
    } finally {
      setBusyFor(id, false)
    }
  }

  const handleLeg = async (
    betId: string,
    selectionId: string,
    status: 'won' | 'lost' | 'pending',
  ) => {
    setBusyFor(betId, true)
    try {
      const res = await fetch(`/api/bets/${betId}/selections/${selectionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      // Re-read the full bet so derived status + payout land in state.
      const reload = await fetch('/api/bets', { cache: 'no-store' })
      if (reload.ok) {
        const d = (await reload.json()) as { bets: PlacedBet[] }
        setBets(d.bets)
      }
    } finally {
      setBusyFor(betId, false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bet permanently?')) return
    setBusyFor(id, true)
    try {
      const res = await fetch(`/api/bets/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setBets((prev) => prev.filter((b) => b.id !== id))
    } finally {
      setBusyFor(id, false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Bets</h1>
        <p className="text-sm text-muted-foreground">
          All bets across the platform. Search by code, team, or league.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by booking code, team, or league…"
            className="pl-10 bg-card border-border"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <FilterPill
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="All"
            count={counts.all}
          />
          <FilterPill
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
            label="Pending"
            count={counts.pending}
          />
          <FilterPill
            active={filter === 'won'}
            onClick={() => setFilter('won')}
            label="Won"
            count={counts.won}
          />
          <FilterPill
            active={filter === 'lost'}
            onClick={() => setFilter('lost')}
            label="Lost"
            count={counts.lost}
          />
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading bets…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 text-sm">
          {bets.length === 0
            ? 'No bets placed yet.'
            : 'No bets match the current search/filter.'}
        </p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden lg:grid grid-cols-[100px_140px_80px_1fr_80px_80px_100px_180px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
            <span>Code</span>
            <span>Date</span>
            <span>Type</span>
            <span>Match</span>
            <span className="text-right">Stake</span>
            <span className="text-right">Odds</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((bet) => {
              const isOpen = expanded.has(bet.id)
              const isBusy = busy.has(bet.id)
              const first = bet.selections[0]
              return (
                <li key={bet.id}>
                  <button
                    onClick={() => toggleExpand(bet.id)}
                    className="w-full text-left hover:bg-secondary/40 transition-colors"
                  >
                    {/* Mobile */}
                    <div className="lg:hidden px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusBadge status={bet.status} />
                          <span className="font-mono text-sm tracking-wider text-primary shrink-0">
                            {bet.code}
                          </span>
                        </div>
                        <span className="text-sm font-bold tabular-nums">
                          {bet.totalOdds.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm truncate">
                        {first
                          ? `${first.match.homeTeam} vs ${first.match.awayTeam}`
                          : '—'}
                        {bet.selections.length > 1 ? ` (+${bet.selections.length - 1})` : ''}
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(bet.placedAt).toLocaleString()}</span>
                        <span>
                          Stake <span className="text-foreground font-semibold">{bet.stake.toFixed(2)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Desktop */}
                    <div className="hidden lg:grid grid-cols-[100px_140px_80px_1fr_80px_80px_100px_180px] gap-3 px-4 py-3 items-center text-sm">
                      <span className="font-mono tracking-wider text-primary">{bet.code}</span>
                      <span className="text-muted-foreground tabular-nums text-xs">
                        {new Date(bet.placedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-xs font-semibold">
                        {bet.selections.length <= 1 ? 'Single' : `Multi (${bet.selections.length})`}
                      </span>
                      <span className="truncate">
                        {first
                          ? `${first.match.homeTeam} vs ${first.match.awayTeam}`
                          : '—'}
                        {bet.selections.length > 1 ? (
                          <span className="text-muted-foreground"> +{bet.selections.length - 1}</span>
                        ) : null}
                      </span>
                      <span className="text-right font-semibold tabular-nums">{bet.stake.toFixed(2)}</span>
                      <span className="text-right tabular-nums">{bet.totalOdds.toFixed(2)}</span>
                      <span><StatusBadge status={bet.status} /></span>
                      <span>
                        <BetActions
                          bet={bet}
                          busy={isBusy}
                          onSettle={(s) => handleSettle(bet.id, s)}
                          onDelete={() => handleDelete(bet.id)}
                        />
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="bg-secondary/40 px-4 py-3 border-t border-border space-y-3">
                      <div className="space-y-1.5">
                        {bet.selections.map((s) => {
                          const pick =
                            s.selection === 'home'
                              ? s.match.homeTeam
                              : s.selection === 'away'
                                ? s.match.awayTeam
                                : 'Draw'
                          const legStatus = s.status ?? 'pending'
                          const legBorder =
                            legStatus === 'won'
                              ? 'border-l-2 border-success bg-success/10'
                              : legStatus === 'lost'
                                ? 'border-l-2 border-destructive bg-destructive/10'
                                : 'border-l-2 border-transparent'
                          const teamColor =
                            legStatus === 'won'
                              ? 'text-success'
                              : legStatus === 'lost'
                                ? 'text-destructive'
                                : 'text-foreground'
                          const busyNow = busy.has(bet.id)
                          const canSettleLeg =
                            bet.status === 'pending' && Boolean(s.id)
                          return (
                            <div
                              key={s.id || s.matchId}
                              className={`text-xs py-1.5 pl-2 pr-1 rounded-r ${legBorder}`}
                            >
                              <div className="flex justify-between gap-2">
                                <span className={`truncate font-medium ${teamColor}`}>
                                  <span aria-hidden className="mr-1">
                                    {getCountryFlag(s.match.country)}
                                  </span>
                                  {s.match.homeTeam} vs {s.match.awayTeam}
                                  {legStatus === 'won' && (
                                    <span className="ml-1.5 text-[10px] font-bold">✓</span>
                                  )}
                                  {legStatus === 'lost' && (
                                    <span className="ml-1.5 text-[10px] font-bold">✗</span>
                                  )}
                                </span>
                                <span className="font-semibold text-primary shrink-0 tabular-nums">
                                  {s.odds.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Pick: <span className="text-foreground">{pick}</span> · {s.match.league}
                              </p>
                              {canSettleLeg && (
                                <div className="flex gap-1.5 mt-1.5">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleLeg(
                                        bet.id,
                                        s.id!,
                                        legStatus === 'won' ? 'pending' : 'won',
                                      )
                                    }}
                                    disabled={busyNow}
                                    className={`h-6 text-[10px] px-2 ${
                                      legStatus === 'won'
                                        ? 'bg-success text-success-foreground'
                                        : 'bg-success/15 text-success hover:bg-success/25 border border-success/30'
                                    }`}
                                    title="Mark this leg won"
                                  >
                                    Won
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleLeg(
                                        bet.id,
                                        s.id!,
                                        legStatus === 'lost' ? 'pending' : 'lost',
                                      )
                                    }}
                                    disabled={busyNow}
                                    className={`h-6 text-[10px] px-2 ${
                                      legStatus === 'lost'
                                        ? 'bg-destructive text-destructive-foreground'
                                        : 'bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30'
                                    }`}
                                    title="Mark this leg lost"
                                  >
                                    Lost
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border text-xs">
                        <Field label="Stake" value={bet.stake.toFixed(2)} />
                        <Field label="Total odds" value={bet.totalOdds.toFixed(2)} />
                        <Field label="To win" value={bet.potentialWin.toFixed(2)} />
                        <Field
                          label={bet.status === 'won' ? 'Payout' : bet.status === 'lost' ? 'Loss' : 'P&L'}
                          value={
                            bet.status === 'won'
                              ? `+${(bet.payout ?? bet.potentialWin).toFixed(2)}`
                              : bet.status === 'lost'
                                ? `-${bet.stake.toFixed(2)}`
                                : '—'
                          }
                          tone={
                            bet.status === 'won'
                              ? 'good'
                              : bet.status === 'lost'
                                ? 'bad'
                                : 'neutral'
                          }
                        />
                      </div>

                      {bet.settledAt && (
                        <p className="text-[11px] text-muted-foreground">
                          Settled {new Date(bet.settledAt).toLocaleString()}
                        </p>
                      )}

                      {/* Mobile actions (desktop has them inline) */}
                      <div className="lg:hidden">
                        <BetActions
                          bet={bet}
                          busy={isBusy}
                          onSettle={(s) => handleSettle(bet.id, s)}
                          onDelete={() => handleDelete(bet.id)}
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(bet.id)
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          {isOpen ? (
                            <>Collapse <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>Expand <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
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
      className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card border border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {label} <span className="opacity-75">({count})</span>
    </button>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'won' | 'lost' }) {
  const cls =
    status === 'won'
      ? 'bg-success/15 text-success border-success/30'
      : status === 'lost'
        ? 'bg-destructive/15 text-destructive border-destructive/30'
        : 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  )
}

function Field({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
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
      <p className={`font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function BetActions({
  bet,
  busy,
  onSettle,
  onDelete,
}: {
  bet: PlacedBet
  busy: boolean
  onSettle: (s: 'won' | 'lost') => void
  onDelete: () => void
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {bet.status === 'pending' ? (
        <>
          <Button
            size="sm"
            onClick={() => onSettle('won')}
            disabled={busy}
            className="h-7 text-xs px-2 bg-success/20 text-success hover:bg-success/30 border border-success/30"
            title="Mark every leg won and pay out (bulk action)"
          >
            Cashout all
          </Button>
          <Button
            size="sm"
            onClick={() => onSettle('lost')}
            disabled={busy}
            className="h-7 text-xs px-2 bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/30"
            title="Mark every leg lost (bulk action)"
          >
            Lock all
          </Button>
        </>
      ) : (
        // Once settled, the bet is locked — no reopen, no further changes.
        <span
          className="h-7 text-[11px] px-2 flex items-center gap-1 rounded-md border border-border bg-secondary/40 text-muted-foreground"
          title="Settled bets are locked"
        >
          <Lock className="w-3 h-3" />
          Locked
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onDelete}
        disabled={busy}
        className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
        title="Delete"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
      </Button>
    </div>
  )
}
