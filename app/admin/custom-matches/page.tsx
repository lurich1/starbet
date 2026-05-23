'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, CircleAlert, CheckCircle2, Upload, X, Lock, Unlock } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sports } from '@/lib/mock-data'
import type { Match } from '@/lib/types'

interface CreateForm {
  sport: string
  league: string
  country: string
  homeTeam: string
  awayTeam: string
  homeFlagUrl: string
  awayFlagUrl: string
  isLive: boolean
  startTime: string
  minute: string
  homeScore: string
  awayScore: string
  oddsHome: string
  oddsDraw: string
  oddsAway: string
}

const blankForm: CreateForm = {
  sport: 'football',
  league: '',
  country: '',
  homeTeam: '',
  awayTeam: '',
  homeFlagUrl: '',
  awayFlagUrl: '',
  isLive: false,
  startTime: '',
  minute: "1'",
  homeScore: '0',
  awayScore: '0',
  oddsHome: '',
  oddsDraw: '',
  oddsAway: '',
}

export default function AdminCustomMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const [form, setForm] = useState<CreateForm>(blankForm)
  const [creating, setCreating] = useState(false)
  // Per-side upload state for flag images
  const [uploadingSide, setUploadingSide] = useState<'home' | 'away' | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/custom-matches', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { matches: Match[] }
      setMatches(data.matches)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const update = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const uploadFlag = async (side: 'home' | 'away', file: File) => {
    setError(null)
    setUploadingSide(side)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/admin/upload-flag', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      update(side === 'home' ? 'homeFlagUrl' : 'awayFlagUrl', data.url as string)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingSide(null)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setOkMsg(null)
    setCreating(true)
    try {
      const payload = {
        sport: form.sport,
        league: form.league,
        country: form.country,
        homeTeam: form.homeTeam,
        awayTeam: form.awayTeam,
        homeFlagUrl: form.homeFlagUrl || undefined,
        awayFlagUrl: form.awayFlagUrl || undefined,
        isLive: form.isLive,
        ...(form.isLive
          ? {
              minute: form.minute,
              homeScore: Number(form.homeScore),
              awayScore: Number(form.awayScore),
            }
          : { startTime: form.startTime }),
        odds: {
          home: Number(form.oddsHome),
          draw: Number(form.oddsDraw),
          away: Number(form.oddsAway),
        },
      }
      const res = await fetch('/api/admin/custom-matches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setMatches((prev) => [data.match as Match, ...prev])
      setForm({ ...blankForm, sport: form.sport })
      setOkMsg(`Added "${data.match.homeTeam} vs ${data.match.awayTeam}".`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this custom match?')) return
    setBusy((p) => new Set(p).add(id))
    try {
      const res = await fetch(`/api/admin/custom-matches/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMatches((prev) => prev.filter((m) => m.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy((p) => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    }
  }

  /**
   * PATCH a match with a partial body. Used by the inline score editor and
   * the Live/Final toggle on each existing match row.
   */
  const handlePatch = async (id: string, patch: Partial<Match>) => {
    setError(null)
    setBusy((p) => new Set(p).add(id))
    try {
      const res = await fetch(`/api/admin/custom-matches/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setMatches((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...(data.match as Match) } : m)),
      )
      setOkMsg('Match updated.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy((p) => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Custom matches</h1>
        <p className="text-sm text-muted-foreground">
          Add games that aren't in The Odds API. They merge into{' '}
          <code className="font-mono text-xs">/api/matches</code> and appear in the public
          listings.
        </p>
      </div>

      {/* Create form */}
      <section className="bg-card border border-border rounded-xl p-4 sm:p-6">
        <header className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Add a match</h2>
        </header>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Sport</Label>
            <select
              value={form.sport}
              onChange={(e) => update('sport', e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-secondary border border-border text-sm"
            >
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>League *</Label>
            <Input
              value={form.league}
              onChange={(e) => update('league', e.target.value)}
              placeholder="e.g. Ghana Premier League"
              required
              className="bg-secondary"
            />
          </div>

          <div>
            <Label>Country</Label>
            <Input
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              placeholder="e.g. Ghana"
              className="bg-secondary"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isLive}
                onChange={(e) => update('isLive', e.target.checked)}
                className="w-4 h-4"
              />
              <span>Match is currently live</span>
            </label>
          </div>

          <div>
            <Label>Home team *</Label>
            <Input
              value={form.homeTeam}
              onChange={(e) => update('homeTeam', e.target.value)}
              placeholder="Hearts of Oak"
              required
              className="bg-secondary"
            />
            <FlagPicker
              label={form.homeTeam || 'Home'}
              url={form.homeFlagUrl}
              uploading={uploadingSide === 'home'}
              onPick={(f) => void uploadFlag('home', f)}
              onClear={() => update('homeFlagUrl', '')}
            />
          </div>

          <div>
            <Label>Away team *</Label>
            <Input
              value={form.awayTeam}
              onChange={(e) => update('awayTeam', e.target.value)}
              placeholder="Asante Kotoko"
              required
              className="bg-secondary"
            />
            <FlagPicker
              label={form.awayTeam || 'Away'}
              url={form.awayFlagUrl}
              uploading={uploadingSide === 'away'}
              onPick={(f) => void uploadFlag('away', f)}
              onClear={() => update('awayFlagUrl', '')}
            />
          </div>

          {form.isLive ? (
            <>
              <div>
                <Label>Minute</Label>
                <Input
                  value={form.minute}
                  onChange={(e) => update('minute', e.target.value)}
                  placeholder="67'"
                  className="bg-secondary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Home score</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.homeScore}
                    onChange={(e) => update('homeScore', e.target.value)}
                    className="bg-secondary"
                  />
                </div>
                <div>
                  <Label>Away score</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.awayScore}
                    onChange={(e) => update('awayScore', e.target.value)}
                    className="bg-secondary"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="md:col-span-2">
              <Label>Start time</Label>
              <Input
                value={form.startTime}
                onChange={(e) => update('startTime', e.target.value)}
                placeholder="19:30"
                className="bg-secondary"
              />
            </div>
          )}

          <div className="md:col-span-2 grid grid-cols-3 gap-3">
            <div>
              <Label>Odds — Home (1) *</Label>
              <Input
                type="number"
                step="0.01"
                min="1.01"
                value={form.oddsHome}
                onChange={(e) => update('oddsHome', e.target.value)}
                placeholder="1.85"
                required
                className="bg-secondary"
              />
            </div>
            <div>
              <Label>Odds — Draw (X)</Label>
              <Input
                type="number"
                step="0.01"
                min="1.01"
                value={form.oddsDraw}
                onChange={(e) => update('oddsDraw', e.target.value)}
                placeholder="3.40"
                className="bg-secondary"
              />
            </div>
            <div>
              <Label>Odds — Away (2) *</Label>
              <Input
                type="number"
                step="0.01"
                min="1.01"
                value={form.oddsAway}
                onChange={(e) => update('oddsAway', e.target.value)}
                placeholder="4.20"
                required
                className="bg-secondary"
              />
            </div>
          </div>

          {error && (
            <div className="md:col-span-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {okMsg && (
            <div className="md:col-span-2 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{okMsg}</span>
            </div>
          )}

          <div className="md:col-span-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm({ ...blankForm, sport: form.sport })}
              disabled={creating}
            >
              Reset
            </Button>
            <Button
              type="submit"
              disabled={creating}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add match
            </Button>
          </div>
        </form>
      </section>

      {/* Existing custom matches */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Existing custom matches ({matches.length})</h2>
        </header>

        {loading ? (
          <div className="p-6 flex items-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : matches.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No custom matches yet. Add one using the form above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {matches.map((m) => (
              <ExistingMatchRow
                key={m.id}
                match={m}
                busy={busy.has(m.id)}
                onDelete={() => handleDelete(m.id)}
                onPatch={(patch) => handlePatch(m.id, patch)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
      {children}
    </label>
  )
}

interface FlagPickerProps {
  label: string
  url: string
  uploading: boolean
  onPick: (file: File) => void
  onClear: () => void
}

function FlagPicker({ label, url, uploading, onPick, onClear }: FlagPickerProps) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="w-10 h-10 rounded-md bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
        {url ? (
          <Image
            src={url}
            alt={`${label} flag`}
            width={40}
            height={40}
            unoptimized
            className="w-10 h-10 object-cover"
          />
        ) : (
          <Upload className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <label className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-secondary border border-border text-xs cursor-pointer hover:bg-secondary/70 transition-colors">
        {uploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" />
            {url ? 'Replace flag' : 'Upload flag'}
          </>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onPick(f)
            e.target.value = ''
          }}
          disabled={uploading}
        />
      </label>
      {url && !uploading && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove flag"
          className="w-8 h-8 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

interface ExistingMatchRowProps {
  match: Match
  busy: boolean
  onDelete: () => void
  onPatch: (patch: Partial<Match>) => void
}

/**
 * One row in the existing-matches list. Lets the admin enter a live score,
 * toggle Live/Final state, and mark the result without opening a modal.
 */
function ExistingMatchRow({ match, busy, onDelete, onPatch }: ExistingMatchRowProps) {
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
    onPatch({
      isLive: true,
      homeScore: Number(home) || 0,
      awayScore: Number(away) || 0,
      minute,
    })
    setEditing(false)
  }

  const finalizeResult = () => {
    onPatch({
      isLive: false,
      homeScore: Number(home) || 0,
      awayScore: Number(away) || 0,
      minute: 'FT',
    })
    setEditing(false)
  }

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="uppercase tracking-wider">{match.sport ?? 'football'}</span>
            <span>·</span>
            <span className="truncate">{match.league}</span>
            {match.country && (
              <>
                <span>·</span>
                <span className="truncate">{match.country}</span>
              </>
            )}
          </div>
          <p className="font-medium text-sm truncate flex items-center gap-1.5">
            {match.homeFlagUrl && (
              <Image
                src={match.homeFlagUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="w-5 h-5 rounded-sm object-cover shrink-0"
              />
            )}
            <span className="truncate">{match.homeTeam}</span>
            <span className="text-muted-foreground">vs</span>
            {match.awayFlagUrl && (
              <Image
                src={match.awayFlagUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="w-5 h-5 rounded-sm object-cover shrink-0"
              />
            )}
            <span className="truncate">{match.awayTeam}</span>
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
            {match.locked && (
              <span className="font-semibold text-destructive flex items-center gap-1">
                <Lock className="w-3 h-3" />
                LOCKED
              </span>
            )}
            {match.isLive ? (
              <span className="text-live font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                LIVE {match.minute} · {match.homeScore ?? 0}-{match.awayScore ?? 0}
              </span>
            ) : match.minute === 'FT' ||
              match.homeScore !== undefined ||
              match.awayScore !== undefined ? (
              <span className="font-semibold text-foreground">
                FT · {match.homeScore ?? 0}-{match.awayScore ?? 0}
              </span>
            ) : (
              <span>{match.startTime || 'No start time'}</span>
            )}
            <span className="tabular-nums">
              1: <b className="text-foreground">{match.odds.home.toFixed(2)}</b>
              {match.odds.draw > 0 && (
                <>
                  {' · '}X: <b className="text-foreground">{match.odds.draw.toFixed(2)}</b>
                </>
              )}
              {' · '}2: <b className="text-foreground">{match.odds.away.toFixed(2)}</b>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!editing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPatch({ locked: !match.locked })}
              disabled={busy}
              className={`h-8 text-xs gap-1 ${
                match.locked
                  ? 'text-destructive border-destructive/40 hover:bg-destructive/10'
                  : ''
              }`}
              title={match.locked ? 'Unlock betting' : 'Lock betting'}
            >
              {match.locked ? (
                <>
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  <span className="hidden sm:inline">Lock</span>
                </>
              )}
            </Button>
          )}
          {!editing && (
            <Button
              size="sm"
              variant="outline"
              onClick={startEdit}
              disabled={busy}
              className="h-8 text-xs"
            >
              Set result
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            className="text-destructive hover:bg-destructive/10 h-8 px-2"
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>{match.homeTeam}</Label>
              <Input
                type="number"
                min="0"
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="h-9 text-center text-base font-bold tabular-nums"
                disabled={busy}
              />
            </div>
            <div>
              <Label>{match.awayTeam}</Label>
              <Input
                type="number"
                min="0"
                value={away}
                onChange={(e) => setAway(e.target.value)}
                className="h-9 text-center text-base font-bold tabular-nums"
                disabled={busy}
              />
            </div>
            <div>
              <Label>Minute</Label>
              <Input
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className="h-9 text-center"
                placeholder="45'"
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveLiveScore}
              disabled={busy}
              className="h-8 text-xs bg-live/20 text-live hover:bg-live/30 border border-live/30"
            >
              Save live score
            </Button>
            <Button
              size="sm"
              onClick={finalizeResult}
              disabled={busy}
              className="h-8 text-xs bg-primary text-primary-foreground"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Final result'}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
