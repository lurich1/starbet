'use client'

import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Header } from '@/components/header'
import { SportsSidebar } from '@/components/sports-sidebar'
import { BetSlip } from '@/components/bet-slip'
import { MatchCard } from '@/components/match-card'
import { PromoCarousel } from '@/components/promo-carousel'
import { LeaguesWithUpcoming } from '@/components/top-events'
import { MobileNav } from '@/components/mobile-nav'
import { HomeBalanceCard } from '@/components/home-balance-card'
import { useMatches } from '@/hooks/use-matches'
import { removeSelectionById, toggleSelection } from '@/lib/bet-slip-utils'
import type { BetSelection } from '@/lib/types'

export default function HomePage() {
  const [activeSport, setActiveSport] = useState('football')
  const [selections, setSelections] = useState<BetSelection[]>([])

  const { matches, liveMatches, upcomingMatches, loading, error, source, reason } =
    useMatches(activeSport, { todayOnly: true })

  const handleToggleSelection = (sel: BetSelection) =>
    setSelections((prev) => toggleSelection(prev, sel))

  const handleRemoveSelection = (id: string) =>
    setSelections((prev) => removeSelectionById(prev, id))

  const handleClearAll = () => setSelections([])

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="flex">
        <SportsSidebar activeSport={activeSport} onSportChange={setActiveSport} />

        <main className="flex-1 min-w-0 min-h-[calc(100vh-64px)] pb-20 xl:pb-0">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 lg:p-6">
            <HomeBalanceCard />
            <LeaguesWithUpcoming matches={matches} />

            <div className="mt-6">
              <PromoCarousel />
            </div>

            {source === 'mock' && (
              <div className="mt-4 p-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Showing demo data ({reason ?? 'API unavailable'}). Add{' '}
                  <code className="font-mono">ODDS_API_KEY</code> in{' '}
                  <code className="font-mono">.env.local</code> for live odds.
                </span>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Failed to load matches: {error}</span>
              </div>
            )}

            <section id="live" className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="w-2 h-2 bg-live rounded-full animate-pulse-live" />
                  Live Now
                </h2>
                <button className="text-sm text-primary hover:underline">View all</button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading matches…
                </div>
              ) : liveMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No live matches right now.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {liveMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      selections={selections}
                      onToggleSelection={handleToggleSelection}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Today's Upcoming Games</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Matches starting today across all countries
                  </p>
                </div>
                <button className="text-sm text-primary hover:underline shrink-0">
                  View all
                </button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading today's matches…
                </div>
              ) : upcomingMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No games scheduled for today.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {upcomingMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      selections={selections}
                      onToggleSelection={handleToggleSelection}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>

        <div className="hidden xl:flex flex-col w-80">
          <BetSlip
            selections={selections}
            onRemoveSelection={handleRemoveSelection}
            onClearAll={handleClearAll}
            onLoadSelections={setSelections}
          />
        </div>
      </div>

      <MobileNav
        selectedBets={selections}
        onRemoveSelection={handleRemoveSelection}
        onClearAll={handleClearAll}
        onLoadSelections={setSelections}
      />
    </div>
  )
}
