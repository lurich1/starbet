'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { Header } from '@/components/header'
import { SportsSidebar } from '@/components/sports-sidebar'
import { BetSlip } from '@/components/bet-slip'
import { MatchCard } from '@/components/match-card'
import { MatchListSkeleton } from '@/components/match-card-skeleton'
import { PromoCarousel } from '@/components/promo-carousel'
import { HomeCategoryRow } from '@/components/home-category-row'
import { BookingCodeBar } from '@/components/booking-code-bar'
import { HomeQuickChips } from '@/components/home-quick-chips'
import { HomeHotTabs, type HomeTab } from '@/components/home-hot-tabs'
import { LeaguesWithUpcoming } from '@/components/top-events'
import { MobileNav } from '@/components/mobile-nav'
import { HomeBalanceCard } from '@/components/home-balance-card'
import { WinnersTicker } from '@/components/winners-ticker'
import { useMatches } from '@/hooks/use-matches'
import { removeSelectionById, toggleSelection } from '@/lib/bet-slip-utils'
import type { BetSelection } from '@/lib/types'

export default function HomePage() {
  const [activeSport, setActiveSport] = useState('football')
  const [selections, setSelections] = useState<BetSelection[]>([])
  const [homeTab, setHomeTab] = useState<HomeTab>('hot')

  // Show all upcoming games (not just today) so the home matches the football
  // page — a strict "today" tz filter was hiding games that show under View all.
  const { matches, liveMatches, upcomingMatches, loading, error } =
    useMatches(activeSport)

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
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-5 lg:p-6 space-y-5">
            <HomeBalanceCard />

            {/* Hero promo */}
            <div id="promos" className="scroll-mt-20">
              <PromoCarousel />
            </div>

            {/* Category icons — one-tap destinations */}
            <HomeCategoryRow />

            {/* Paste a booking code straight into the slip */}
            <BookingCodeBar onLoad={setSelections} />

            {/* Quick-filter chips */}
            <HomeQuickChips />

            <WinnersTicker />

            <LeaguesWithUpcoming matches={matches} />

            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2 shadow-card">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Failed to load matches: {error}</span>
              </div>
            )}

            <section id="live" className="space-y-3">
              <HomeHotTabs
                value={homeTab}
                onChange={setHomeTab}
                liveCount={liveMatches.length}
              />
              {(() => {
                const list =
                  homeTab === 'live'
                    ? liveMatches
                    : homeTab === 'matches'
                      ? upcomingMatches
                      : upcomingMatches.slice(0, 12)
                if (loading) return <MatchListSkeleton count={6} />
                if (list.length === 0) {
                  return (
                    <EmptyState
                      title={
                        homeTab === 'live'
                          ? 'No live matches right now'
                          : 'No games to show right now'
                      }
                      description={
                        homeTab === 'live'
                          ? 'Switch to Hot or Matches, or check live again shortly.'
                          : 'Check back soon or browse the football page.'
                      }
                    />
                  )
                }
                return (
                  <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                    {list.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        selections={selections}
                        onToggleSelection={handleToggleSelection}
                      />
                    ))}
                  </div>
                )
              })()}

              {homeTab !== 'live' && (
                <div className="text-center pt-1">
                  <Link
                    href="/football"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:brightness-110 transition"
                  >
                    View all matches
                    <ChevronRight className="w-4 h-4" />
                  </Link>
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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
      <p className="font-semibold text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}
