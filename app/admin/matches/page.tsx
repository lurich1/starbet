'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCcw, AlertCircle, CheckCircle2, Pencil, Lock, Unlock, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sports } from '@/lib/mock-data'
import type { Match } from '@/lib/types'

interface MatchesResponse {
  source: 'odds-api' | 'mock'
  reason?: string
  matches: Match[]
}

export default function AdminMatchesPage() {
  const [activeSport, setActiveSport] = useState('football')
  const [data, setData] = useState<MatchesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches?sport=${encodeURIComponent(activeSport)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as MatchesResponse
      setData(json)
      setLastFetched(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSport])

  const matches = data?.matches ?? []
  const liveCount = matches.filter((m) => m.isLive).length

  const applyOverride = async (id: string, patch: Record<string, unknown>) => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/match-overrides/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const clearOverride = async (id: string) => {
    if (!confirm('Clear admin override — match will revert to source values?')) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/match-overrides/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Matches monitor</h1>
          <p className="text-sm text-muted-foreground">
            Live snapshot of what the /api/matches endpoint returns per sport.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Sport tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {sports.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSport(s.id)}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeSport === s.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{s.icon}</span>
            <span>{s.name}</span>
          </button>
        ))}
      </div>

      {/* Source indicator */}
      {data && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
            data.source === 'odds-api'
              ? 'bg-success/10 border-success/20 text-success'
              : 'bg-secondary border-border text-muted-foreground'
          }`}
        >
          {data.source === 'odds-api' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold">
              Source: <span className="font-mono">{data.source}</span>
              {data.reason ? <span className="font-normal"> · {data.reason}</span> : ''}
            </p>
            <p className="text-xs opacity-80">
              {matches.length} match{matches.length === 1 ? '' : 'es'} · {liveCount} live
              {lastFetched ? ` · fetched ${lastFetched.toLocaleTimeString()}` : ''}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Match list */}
      {loading && !data ? (
        <div className="flex items-center text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : matches.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 text-sm">
          No matches returned for {activeSport}.
        </p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[60px_1fr_120px_60px_60px_60px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
            <span>Status</span>
            <span>Match · League</span>
            <span>Time</span>
            <span className="text-right">1</span>
            <span className="text-right">X</span>
            <span className="text-right">2</span>
          </div>
          <ul className="divide-y divide-border">
            {matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                onLockToggle={() => applyOverride(m.id, { locked: !m.locked })}
                onApply={(patch) => applyOverride(m.id, patch)}
                onClear={() => clearOverride(m.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface MatchRowProps {
  match: Match
  onLockToggle: () => void
  onApply: (patch: { homeScore?: number; awayScore?: number; minute?: string; isLive?: boolean }) => void
  onClear: () => void
}

function MatchRow({ match, onLockToggle, onApply, onClear }: MatchRowProps) {
  const [editing, setEditing] = useState(false)
  const [home, setHome] = useState(String(match.homeScore ?? 0))
  const [away, setAway] = useState(String(match.awayScore ?? 0))
  const [minute, setMinute] = useState(match.minute ?? "1'")

  const startEdit = () => {
    setHome(String(match.homeScore ?? 0))
    setAway(String(match.awayScore ?? 0))
    setMinute(match.minute ?? "1'")
    setEditing(true)
  }

  const saveLiveScore = () => {
    onApply({
      isLive: true,
      homeScore: Number(home) || 0,
      awayScore: Number(away) || 0,
      minute,
    })
    setEditing(false)
  }

  const finalize = () => {
    onApply({
      isLive: false,
      homeScore: Number(home) || 0,
      awayScore: Number(away) || 0,
      minute: 'FT',
    })
    setEditing(false)
  }

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="md:grid md:grid-cols-[60px_1fr_120px_60px_60px_60px_120px] md:gap-3 md:items-center flex flex-col gap-1">
        <div className="md:order-1 flex md:flex-col items-start gap-1.5">
          {match.isLive ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-live">
              <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
              LIVE
            </span>
          ) : (
            <span className="text-[10px] uppercase text-muted-foreground">Upcoming</span>
          )}
          {match.custom && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-primary/40 text-primary bg-primary/10">
              Custom
            </span>
          )}
          {match.locked && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              Locked
            </span>
          )}
        </div>
        <div className="md:order-2 min-w-0">
          <p className="font-medium text-sm truncate">
            {match.homeTeam} <span className="text-muted-foreground">vs</span> {match.awayTeam}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {match.league}
            {match.country ? ` · ${match.country}` : ''}
            {(match.homeScore !== undefined || match.awayScore !== undefined) && (
              <span className="ml-2 font-semibold text-foreground tabular-nums">
                {match.homeScore ?? 0}-{match.awayScore ?? 0}
              </span>
            )}
          </p>
        </div>
        <div className="md:order-3 text-xs text-muted-foreground tabular-nums">
          {match.isLive ? match.minute : match.startTime ?? '—'}
        </div>
        <div className="md:order-4 md:text-right text-xs tabular-nums">
          <span className="md:hidden text-muted-foreground mr-1">1:</span>
          <span className="font-semibold">{match.odds.home.toFixed(2)}</span>
        </div>
        <div className="md:order-5 md:text-right text-xs tabular-nums">
          <span className="md:hidden text-muted-foreground mr-1">X:</span>
          <span className="font-semibold">{match.odds.draw.toFixed(2)}</span>
        </div>
        <div className="md:order-6 md:text-right text-xs tabular-nums">
          <span className="md:hidden text-muted-foreground mr-1">2:</span>
          <span className="font-semibold">{match.odds.away.toFixed(2)}</span>
        </div>
        <div className="md:order-7 flex items-center gap-1 md:justify-end">
          {!editing && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onLockToggle}
                className={`h-7 px-2 text-xs ${match.locked ? 'text-destructive border-destructive/40 hover:bg-destructive/10' : ''}`}
                title={match.locked ? 'Unlock' : 'Lock'}
              >
                {match.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={startEdit}
                className="h-7 px-2 text-xs"
                title="Edit score"
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onClear}
                className="h-7 px-2 text-xs text-muted-foreground"
                title="Clear admin override"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                {match.homeTeam}
              </label>
              <Input
                type="number"
                min="0"
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="h-9 text-center text-base font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                {match.awayTeam}
              </label>
              <Input
                type="number"
                min="0"
                value={away}
                onChange={(e) => setAway(e.target.value)}
                className="h-9 text-center text-base font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                Minute
              </label>
              <Input
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className="h-9 text-center"
                placeholder="45'"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveLiveScore}
              className="h-8 text-xs bg-live/20 text-live hover:bg-live/30 border border-live/30"
            >
              Save live score
            </Button>
            <Button
              size="sm"
              onClick={finalize}
              className="h-8 text-xs bg-primary text-primary-foreground"
            >
              Final result
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
