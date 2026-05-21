'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, Filter, Wallet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MatchList } from '@/components/match-list'
import { BetSlip } from '@/components/bet-slip'
import { MobileNav } from '@/components/mobile-nav'
import { countries } from '@/lib/mock-data'
import { useMatches } from '@/hooks/use-matches'
import { removeSelectionById, toggleSelection } from '@/lib/bet-slip-utils'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import type { BetSelection } from '@/lib/types'

interface LeagueChip {
  name: string
  count: number
}

export default function FootballPage() {
  const [selectedBets, setSelectedBets] = useState<BetSelection[]>([])
  const [activeLeague, setActiveLeague] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLiveOnly, setShowLiveOnly] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  const { matches: footballMatches, loading } = useMatches('football')

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

  const handleToggleSelection = (sel: BetSelection) =>
    setSelectedBets((prev) => toggleSelection(prev, sel))

  const handleRemoveSelection = (id: string) =>
    setSelectedBets((prev) => removeSelectionById(prev, id))

  const filteredMatches = footballMatches.filter((match) => {
    const matchesSearch =
      match.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.league.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesLeague = activeLeague ? match.league === activeLeague : true
    const matchesLive = showLiveOnly ? match.isLive : true

    return matchesSearch && matchesLeague && matchesLive
  })

  const liveCount = footballMatches.filter((m) => m.isLive).length

  const leagueChips: LeagueChip[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of footballMatches) {
      counts.set(m.league, (counts.get(m.league) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [footballMatches])

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
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-2xl">⚽</span>
              <h1 className="text-xl font-bold text-foreground">Football</h1>
            </div>
            {liveCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-live/15 text-live text-xs font-semibold">
                <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                {liveCount} Live
              </span>
            )}
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
          {/* Sidebar — Leagues */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="bg-card border border-border rounded-xl p-4 sticky top-20">
              <h2 className="font-semibold text-foreground mb-4">Leagues</h2>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveLeague(null)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeLeague === null
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <span>All Leagues</span>
                  <span className="text-xs">{footballMatches.length}</span>
                </button>
                {leagueChips.map((chip) => (
                  <button
                    key={chip.name}
                    onClick={() => setActiveLeague(chip.name)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeLeague === chip.name
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary text-foreground'
                    }`}
                  >
                    <span className="truncate">{chip.name}</span>
                    <span className="text-xs">{chip.count}</span>
                  </button>
                ))}
              </div>

              <hr className="my-4 border-border" />

              <h2 className="font-semibold text-foreground mb-4">Countries A-Z</h2>
              <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                {countries.slice(0, 12).map((country) => (
                  <Link
                    key={country.code}
                    href={`/football/${country.code.toLowerCase()}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    <span>{country.flag}</span>
                    <span>{country.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search teams or leagues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-card border-border"
                />
              </div>
              <Button
                variant={showLiveOnly ? 'default' : 'outline'}
                className={`gap-2 ${
                  showLiveOnly ? 'bg-live hover:bg-live/90 text-white' : ''
                }`}
                onClick={() => setShowLiveOnly((v) => !v)}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    showLiveOnly ? 'bg-white' : 'bg-live'
                  } ${showLiveOnly ? '' : 'animate-pulse-live'}`}
                />
                {showLiveOnly ? 'Showing Live' : `Live${liveCount ? ` (${liveCount})` : ''}`}
              </Button>
              <Button variant="outline" className="gap-2 sm:hidden">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
            </div>

            {/* Mobile League Filter — derived from real matches */}
            {leagueChips.length > 0 && (
              <div className="lg:hidden mb-4 flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button
                  onClick={() => setActiveLeague(null)}
                  className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                    activeLeague === null
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-foreground'
                  }`}
                >
                  All
                </button>
                {leagueChips.map((chip) => (
                  <button
                    key={chip.name}
                    onClick={() => setActiveLeague(chip.name)}
                    className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                      activeLeague === chip.name
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-foreground'
                    }`}
                  >
                    {chip.name}
                  </button>
                ))}
              </div>
            )}

            {/* Match List */}
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading matches…
              </div>
            ) : filteredMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {showLiveOnly
                  ? 'No live matches right now.'
                  : 'No matches match your filters.'}
              </p>
            ) : (
              <MatchList
                matches={filteredMatches}
                selectedBets={selectedBets}
                onToggleSelection={handleToggleSelection}
                showLeague={!activeLeague}
              />
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
        activeTab="football"
      />
    </div>
  )
}
