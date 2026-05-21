'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Wallet,
  RefreshCw,
  Radio,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatchList } from '@/components/match-list'
import { BetSlip } from '@/components/bet-slip'
import { MobileNav } from '@/components/mobile-nav'
import { useMatches } from '@/hooks/use-matches'
import { allSportsData, sports } from '@/lib/mock-data'
import { removeSelectionById, toggleSelection } from '@/lib/bet-slip-utils'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import type { BetSelection, Match } from '@/lib/types'

function getDemoLiveMatches(sport: string): Match[] {
  const all = (allSportsData as Record<string, Match[]>)[sport] ?? []
  return all
    .filter((m) => m.isLive)
    .map((m) => ({ ...m, demo: true, id: `demo-${m.id}` }))
}

export default function LivePage() {
  const [selectedBets, setSelectedBets] = useState<BetSelection[]>([])
  const [activeSport, setActiveSport] = useState<string>('football')
  const [activeLeague, setActiveLeague] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const { matches, loading, source, reason, refresh } = useMatches(activeSport)
  const realLive = useMemo(() => matches.filter((m) => m.isLive), [matches])

  // Demo fallback: when the real API returns 0 in-play events, fill in mock
  // live matches so users can still see the live UI working. Clearly tagged.
  const displayLive = useMemo(() => {
    if (realLive.length > 0) return realLive
    if (loading) return []
    return getDemoLiveMatches(activeSport)
  }, [realLive, loading, activeSport])

  const isShowingDemo = displayLive.length > 0 && displayLive.every((m) => m.demo)

  // Leagues sidebar/chips, derived from the live matches actually being shown
  const liveLeagues = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of displayLive) {
      counts.set(m.league, (counts.get(m.league) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [displayLive])

  const filteredLive = activeLeague
    ? displayLive.filter((m) => m.league === activeLeague)
    : displayLive

  useEffect(() => {
    setUserId(getUserId())
  }, [])

  useEffect(() => {
    if (!userId) {
      setBalance(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setBalance(typeof data.balance === 'number' ? data.balance : 0)
      } catch {
        /* ignore */
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [userId])

  // Auto-refresh real data every 30s.
  useEffect(() => {
    const t = setInterval(() => {
      refresh()
      setLastRefresh(new Date())
    }, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  // Reset league filter when sport changes
  useEffect(() => {
    setActiveLeague(null)
  }, [activeSport])

  const handleToggleSelection = (sel: BetSelection) =>
    setSelectedBets((prev) => toggleSelection(prev, sel))

  const handleRemoveSelection = (id: string) =>
    setSelectedBets((prev) => removeSelectionById(prev, id))

  const handleManualRefresh = () => {
    refresh()
    setLastRefresh(new Date())
  }

  const depositHref = userId ? `/users/first-deposit?userId=${userId}` : '/register'
  const refreshTimeLabel = lastRefresh.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const activeSportMeta = sports.find((s) => s.id === activeSport)

  return (
    <div className="min-h-screen bg-background pb-20 xl:pb-0">
      {/* ─── Header (responsive) ─── */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4">
          <div className="flex items-center h-14 gap-2 sm:gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <Radio className="w-5 h-5 text-live shrink-0 animate-pulse-live" />
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                Live Betting
              </h1>
            </div>
            {displayLive.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-live/15 text-live text-[11px] sm:text-xs font-semibold shrink-0">
                <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                {displayLive.length}
                <span className="hidden sm:inline">live</span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {userId ? (
                <>
                  <Link
                    href="/me"
                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2ecc71]/10 border border-[#2ecc71]/40 hover:bg-[#2ecc71]/20 transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-[#2ecc71]" />
                    <span className="text-xs text-muted-foreground">Balance</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {balance === null ? '—' : `GHS ${formatMoney(balance)}`}
                    </span>
                  </Link>
                  <Link href="/me" className="md:hidden">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2ecc71]/10 border border-[#2ecc71]/40 text-[11px] font-bold text-foreground tabular-nums">
                      <Wallet className="w-3 h-3 text-[#2ecc71]" />
                      {balance === null ? '—' : formatMoney(balance)}
                    </span>
                  </Link>
                  <Link href={depositHref} className="hidden sm:block">
                    <Button
                      size="sm"
                      className="bg-[#2ecc71] hover:bg-[#27ae60] text-white font-bold gap-1.5"
                    >
                      <Wallet className="w-4 h-4" />
                      Deposit
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="outline" size="sm" className="hidden sm:flex">
                      Login
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button
                      size="sm"
                      className="hidden sm:flex bg-primary text-primary-foreground"
                    >
                      Register
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-4">
        <div className="flex gap-4 lg:gap-6">
          {/* ─── Desktop sidebar: sports + leagues ─── */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="bg-card border border-border rounded-xl p-4 sticky top-20 space-y-5">
              <div>
                <h2 className="font-semibold text-foreground mb-3 text-sm">Sports</h2>
                <div className="space-y-1">
                  {sports.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSport(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeSport === s.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      <span className="text-lg">{s.icon}</span>
                      <span className="font-medium">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {liveLeagues.length > 0 && (
                <div>
                  <h2 className="font-semibold text-foreground mb-3 text-sm">
                    Live leagues
                  </h2>
                  <div className="space-y-1">
                    <button
                      onClick={() => setActiveLeague(null)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeLeague === null
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      <span>All leagues</span>
                      <span className="text-xs">{displayLive.length}</span>
                    </button>
                    {liveLeagues.map((l) => (
                      <button
                        key={l.name}
                        onClick={() => setActiveLeague(l.name)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                          activeLeague === l.name
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        <span className="truncate">{l.name}</span>
                        <span className="text-xs flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                          {l.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ─── Main column ─── */}
          <main className="flex-1 min-w-0">
            {/* Mobile sport pills + refresh */}
            <div className="lg:hidden flex items-center gap-2 mb-3">
              <div className="flex-1 flex gap-2 overflow-x-auto pb-1 custom-scrollbar -mx-3 px-3">
                {sports.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSport(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      activeSport === s.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-foreground'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={loading}
                className="shrink-0 p-2 rounded-full text-muted-foreground hover:text-foreground bg-card border border-border disabled:opacity-50"
                aria-label="Refresh live matches"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Desktop refresh + active-sport header */}
            <div className="hidden lg:flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{activeSportMeta?.icon}</span>
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Live {activeSportMeta?.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {displayLive.length === 0
                      ? 'No matches in-play'
                      : `${displayLive.length} match${
                          displayLive.length === 1 ? '' : 'es'
                        } in-play · ${liveLeagues.length} league${
                          liveLeagues.length === 1 ? '' : 's'
                        }`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
                aria-label="Refresh live matches"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Updated {refreshTimeLabel}
              </button>
            </div>

            {/* Mobile league chips */}
            {liveLeagues.length > 1 && (
              <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-3 custom-scrollbar -mx-3 px-3">
                <button
                  onClick={() => setActiveLeague(null)}
                  className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                    activeLeague === null
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-foreground'
                  }`}
                >
                  All
                </button>
                {liveLeagues.map((l) => (
                  <button
                    key={l.name}
                    onClick={() => setActiveLeague(l.name)}
                    className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                      activeLeague === l.name
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-foreground'
                    }`}
                  >
                    {l.name} ({l.count})
                  </button>
                ))}
              </div>
            )}

            {/* Banners */}
            {isShowingDemo && (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100 dark:text-amber-200 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  No real matches are in-play right now. Showing{' '}
                  <span className="font-semibold">demo live matches</span> so you can
                  preview the live betting UI. Real games appear automatically when
                  they kick off.
                </span>
              </div>
            )}
            {source === 'mock' && !isShowingDemo && (
              <div className="mb-3 p-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground">
                Showing demo data ({reason ?? 'API unavailable'}).
              </div>
            )}

            {/* Match list / empty state */}
            {loading && displayLive.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading live matches…
              </div>
            ) : filteredLive.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-10 sm:p-12 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 bg-secondary rounded-full flex items-center justify-center">
                  <Radio className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-foreground font-semibold mb-1">
                  No live {activeSportMeta?.name.toLowerCase()} matches right now
                </p>
                <p className="text-sm text-muted-foreground">
                  Auto-refreshing every 30 seconds. Try another sport above.
                </p>
              </div>
            ) : (
              <MatchList
                matches={filteredLive}
                selectedBets={selectedBets}
                onToggleSelection={handleToggleSelection}
                showLeague
              />
            )}

            {/* Mobile refresh status footer */}
            <p className="lg:hidden text-[11px] text-center text-muted-foreground mt-4">
              Auto-refreshing every 30s · Updated {refreshTimeLabel}
            </p>
          </main>

          {/* ─── Desktop bet slip ─── */}
          <aside className="hidden lg:block w-80 shrink-0">
            <div className="sticky top-20">
              <BetSlip
                selections={selectedBets}
                onRemoveSelection={handleRemoveSelection}
                onClearAll={() => setSelectedBets([])}
                onLoadSelections={setSelectedBets}
              />
            </div>
          </aside>
        </div>
      </div>

      <MobileNav
        selectedBets={selectedBets}
        onRemoveSelection={handleRemoveSelection}
        onClearAll={() => setSelectedBets([])}
        onLoadSelections={setSelectedBets}
        activeTab="live"
      />
    </div>
  )
}
