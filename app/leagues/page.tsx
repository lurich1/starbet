'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Search,
  ChevronRight,
  Trophy,
  Globe,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BetSlip } from '@/components/bet-slip'
import { MobileNav } from '@/components/mobile-nav'
import { countries } from '@/lib/mock-data'
import { leagueMeta } from '@/lib/leagues-meta'
import { useMatches } from '@/hooks/use-matches'
import { removeSelectionById } from '@/lib/bet-slip-utils'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import type { BetSelection, Match } from '@/lib/types'

interface LeagueEntry {
  id: string
  name: string
  country: string
  flag: string
  matchCount: number
  liveCount: number
}

function matchesLeague(match: Match, filters: string[]): boolean {
  const lower = match.league.toLowerCase()
  return filters.some((f) => lower.includes(f.toLowerCase()))
}

export default function LeaguesPage() {
  const [selectedBets, setSelectedBets] = useState<BetSelection[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'top' | 'all' | 'countries'>('top')
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  const { matches: footballMatches } = useMatches('football')

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

  const handleRemoveSelection = (id: string) =>
    setSelectedBets((prev) => removeSelectionById(prev, id))

  // Real counts: build league entries from leagueMeta + actual match data
  const allLeagueEntries: LeagueEntry[] = useMemo(() => {
    const footballMeta = leagueMeta.filter((l) => l.sport === 'football')
    return footballMeta.map((meta) => {
      const matched = footballMatches.filter((m) => matchesLeague(m, meta.matchFilters))
      return {
        id: meta.slug,
        name: meta.name,
        country: meta.country,
        flag: meta.flag,
        matchCount: matched.length,
        liveCount: matched.filter((m) => m.isLive).length,
      }
    })
  }, [footballMatches])

  // Also include any leagues from the live feed that aren't in leagueMeta
  const extraLeagueEntries: LeagueEntry[] = useMemo(() => {
    const known = new Set(
      leagueMeta
        .filter((l) => l.sport === 'football')
        .flatMap((l) => l.matchFilters.map((f) => f.toLowerCase())),
    )
    const grouped = new Map<string, { country: string; count: number; live: number }>()
    for (const m of footballMatches) {
      const lower = m.league.toLowerCase()
      const isKnown = [...known].some((k) => lower.includes(k))
      if (isKnown) continue
      const entry = grouped.get(m.league) ?? { country: m.country, count: 0, live: 0 }
      entry.count++
      if (m.isLive) entry.live++
      grouped.set(m.league, entry)
    }
    return Array.from(grouped.entries()).map(([name, v]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name,
      country: v.country,
      flag: '⚽',
      matchCount: v.count,
      liveCount: v.live,
    }))
  }, [footballMatches])

  const combinedLeagues = useMemo(
    () =>
      [...allLeagueEntries, ...extraLeagueEntries].sort(
        (a, b) => b.matchCount - a.matchCount,
      ),
    [allLeagueEntries, extraLeagueEntries],
  )

  const topLeagues = useMemo(
    () => combinedLeagues.filter((l) => l.matchCount > 0).slice(0, 8),
    [combinedLeagues],
  )

  const filteredLeagues = combinedLeagues.filter(
    (l) =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.country.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredCountries = countries.filter((country) =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const depositHref = userId ? `/users/first-deposit?userId=${userId}` : '/register'

  return (
    <div className="min-h-screen bg-background pb-20 xl:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center h-14 gap-3 sm:gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Leagues</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {userId ? (
                <>
                  <Link
                    href="/me"
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2ecc71]/10 border border-[#2ecc71]/40 hover:bg-[#2ecc71]/20 transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-[#2ecc71]" />
                    <span className="text-xs text-muted-foreground">Balance</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {balance === null ? '—' : `GHS ${formatMoney(balance)}`}
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

      <div className="max-w-[1400px] mx-auto px-4 py-4">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="bg-card border border-border rounded-xl p-4 sticky top-20">
              <h2 className="font-semibold text-foreground mb-4">Quick Links</h2>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab('top')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeTab === 'top'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                  Top Leagues
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeTab === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <span>⚽</span>
                  All Leagues
                </button>
                <button
                  onClick={() => setActiveTab('countries')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeTab === 'countries'
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  By Country
                </button>
              </div>

              {topLeagues.length > 0 && (
                <>
                  <hr className="my-4 border-border" />
                  <h2 className="font-semibold text-foreground mb-4">Popular</h2>
                  <div className="space-y-1">
                    {topLeagues.slice(0, 5).map((league) => (
                      <Link
                        key={league.id}
                        href={`/leagues/${league.id}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{league.flag}</span>
                          <span className="truncate">{league.name}</span>
                        </span>
                        {league.liveCount > 0 && (
                          <span className="w-2 h-2 bg-live rounded-full animate-pulse-live shrink-0" />
                        )}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Search Bar */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search leagues or countries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>

            {/* Mobile Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
              <button
                onClick={() => setActiveTab('top')}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors flex items-center gap-2 ${
                  activeTab === 'top'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Top Leagues
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeTab === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground'
                }`}
              >
                All Leagues
              </button>
              <button
                onClick={() => setActiveTab('countries')}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors flex items-center gap-2 ${
                  activeTab === 'countries'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground'
                }`}
              >
                <Globe className="w-4 h-4" />
                Countries
              </button>
            </div>

            {/* Top Leagues Grid */}
            {activeTab === 'top' && (
              <div className="space-y-6">
                <h2 className="text-lg font-bold text-foreground">Top Football Leagues</h2>
                {topLeagues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No leagues with matches right now.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {topLeagues.map((league) => (
                      <Link
                        key={league.id}
                        href={`/leagues/${league.id}`}
                        className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-secondary rounded-xl flex items-center justify-center text-2xl">
                            {league.flag}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {league.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">{league.country}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-foreground tabular-nums">
                              {league.matchCount}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {league.matchCount === 1 ? 'match' : 'matches'}
                            </p>
                            {league.liveCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-live mt-1">
                                <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                                {league.liveCount} live
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* All Leagues */}
            {activeTab === 'all' && (
              <div className="space-y-6">
                <h2 className="text-lg font-bold text-foreground">All Leagues</h2>
                {filteredLeagues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? 'No leagues match your search.'
                      : 'No leagues to show right now.'}
                  </p>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground px-4 py-3 border-b border-border bg-secondary/50">
                      <span>League</span>
                      <span>Country</span>
                      <span className="text-right">Matches</span>
                    </div>
                    <div className="divide-y divide-border">
                      {filteredLeagues.map((league) => (
                        <Link
                          key={league.id}
                          href={`/leagues/${league.id}`}
                          className="grid grid-cols-3 items-center px-4 py-3 hover:bg-secondary/50 transition-colors"
                        >
                          <span className="flex items-center gap-2 font-medium text-foreground min-w-0">
                            <span className="shrink-0">{league.flag}</span>
                            <span className="truncate">{league.name}</span>
                          </span>
                          <span className="text-sm text-muted-foreground truncate">
                            {league.country}
                          </span>
                          <span className="text-right text-sm text-foreground tabular-nums flex items-center justify-end gap-2">
                            {league.liveCount > 0 && (
                              <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                            )}
                            {league.matchCount}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Countries */}
            {activeTab === 'countries' && (
              <div className="space-y-6">
                <h2 className="text-lg font-bold text-foreground">Countries A-Z</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredCountries.map((country) => {
                    const matchCount = footballMatches.filter(
                      (m) => m.country.toLowerCase() === country.name.toLowerCase(),
                    ).length

                    return (
                      <Link
                        key={country.code}
                        href={`/football/${country.code.toLowerCase()}`}
                        className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{country.flag}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {country.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {matchCount > 0
                                ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`
                                : 'No matches'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </main>

          {/* Bet Slip Sidebar */}
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

      {/* Mobile Navigation */}
      <MobileNav
        selectedBets={selectedBets}
        onRemoveSelection={handleRemoveSelection}
        onClearAll={() => setSelectedBets([])}
        onLoadSelections={setSelectedBets}
      />
    </div>
  )
}
