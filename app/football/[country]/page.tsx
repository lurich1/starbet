'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatchList } from '@/components/match-list'
import { BetSlip } from '@/components/bet-slip'
import { MobileNav } from '@/components/mobile-nav'
import { useMatches } from '@/hooks/use-matches'
import { countries } from '@/lib/mock-data'
import { removeSelectionById, toggleSelection } from '@/lib/bet-slip-utils'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import type { BetSelection } from '@/lib/types'

interface PageProps {
  params: Promise<{ country: string }>
}

export default function CountryFootballPage({ params }: PageProps) {
  const { country: countrySlug } = use(params)
  const country = countries.find(
    (c) => c.code.toLowerCase() === countrySlug.toLowerCase(),
  )
  if (!country) notFound()

  const [selectedBets, setSelectedBets] = useState<BetSelection[]>([])
  const [activeLeague, setActiveLeague] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  const { matches, loading, source, reason } = useMatches('football')

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

  const countryMatches = useMemo(
    () =>
      matches.filter(
        (m) => m.country.toLowerCase() === country.name.toLowerCase(),
      ),
    [matches, country.name],
  )

  const leagues = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of countryMatches) {
      counts.set(m.league, (counts.get(m.league) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [countryMatches])

  const filtered = activeLeague
    ? countryMatches.filter((m) => m.league === activeLeague)
    : countryMatches

  const liveCount = countryMatches.filter((m) => m.isLive).length
  const depositHref = userId ? `/users/first-deposit?userId=${userId}` : '/register'

  const handleToggleSelection = (sel: BetSelection) =>
    setSelectedBets((prev) => toggleSelection(prev, sel))

  const handleRemoveSelection = (id: string) =>
    setSelectedBets((prev) => removeSelectionById(prev, id))

  return (
    <div className="min-h-screen bg-background pb-20 xl:pb-0">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center h-14 gap-3 sm:gap-4">
            <Link
              href="/football"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-2xl shrink-0">{country.flag}</span>
              <h1 className="text-xl font-bold text-foreground truncate">
                {country.name} Football
              </h1>
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
          {/* Leagues sidebar (derived from real matches in this country) */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="bg-card border border-border rounded-xl p-4 sticky top-20">
              <h2 className="font-semibold text-foreground mb-4">
                Leagues in {country.name}
              </h2>
              {leagues.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No leagues with matches right now.
                </p>
              ) : (
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
                    <span className="text-xs">{countryMatches.length}</span>
                  </button>
                  {leagues.map((l) => (
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
                      <span className="text-xs">{l.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            {/* Country hero */}
            <div className="bg-card border border-border rounded-xl p-5 mb-4 flex items-center gap-5">
              <div className="w-16 h-16 bg-secondary rounded-xl flex items-center justify-center text-3xl shrink-0">
                {country.flag}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground truncate">
                  {country.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {countryMatches.length === 0
                    ? 'No fixtures available'
                    : `${countryMatches.length} match${countryMatches.length === 1 ? '' : 'es'} · ${leagues.length} league${leagues.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>

            {/* Mobile league chips */}
            {leagues.length > 0 && (
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
                {leagues.map((l) => (
                  <button
                    key={l.name}
                    onClick={() => setActiveLeague(l.name)}
                    className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                      activeLeague === l.name
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-foreground'
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}

            {source === 'mock' && (
              <div className="mb-4 p-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground">
                Showing demo data ({reason ?? 'API unavailable'}).
              </div>
            )}

            {loading ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading matches…
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                {countryMatches.length === 0
                  ? `No upcoming matches for ${country.name} right now.`
                  : `No matches in ${activeLeague}.`}
              </div>
            ) : (
              <MatchList
                matches={filtered}
                selectedBets={selectedBets}
                onToggleSelection={handleToggleSelection}
                showLeague={!activeLeague}
              />
            )}
          </main>

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
      />
    </div>
  )
}
