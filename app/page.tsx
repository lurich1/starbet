'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays } from 'lucide-react'
import { Header } from '@/components/header'
import { SportsSidebar } from '@/components/sports-sidebar'
import { BetSlip } from '@/components/bet-slip'
import { MatchCard } from '@/components/match-card'
import { MatchListSkeleton } from '@/components/match-card-skeleton'
import { PromoCarousel } from '@/components/promo-carousel'
import { QuickActions } from '@/components/quick-actions'
import { LeaguesWithUpcoming } from '@/components/top-events'
import { MobileNav } from '@/components/mobile-nav'
import { HomeBalanceCard } from '@/components/home-balance-card'
import { WinnersTicker } from '@/components/winners-ticker'
import { SectionHeader } from '@/components/section-header'
import { useMatches } from '@/hooks/use-matches'
import { removeSelectionById, toggleSelection } from '@/lib/bet-slip-utils'
import { getUserId } from '@/lib/user-session'
import type { BetSelection } from '@/lib/types'

export default function HomePage() {
  const [activeSport, setActiveSport] = useState('football')
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => setUserId(getUserId()), [])
  const [selections, setSelections] = useState<BetSelection[]>([])

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
            <PromoCarousel />

            {/* Quick-action tiles — one-tap destinations */}
            <QuickActions userId={userId} />

            <WinnersTicker />

            <LeaguesWithUpcoming matches={matches} />

            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2 shadow-card">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Failed to load matches: {error}</span>
              </div>
            )}

            <section id="live">
              <SectionHeader
                title="Live Now"
                icon={
                  <span className="w-2 h-2 bg-live rounded-full animate-pulse-live" />
                }
                count={liveMatches.length}
                viewAllHref="/live"
              />
              {loading ? (
                <MatchListSkeleton count={4} />
              ) : liveMatches.length === 0 ? (
                <EmptyState
                  title="No live matches right now"
                  description="Browse upcoming games below or check live again in a few minutes."
                />
              ) : (
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
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

            <section>
              <SectionHeader
                title="Upcoming games"
                description="Top games across every league"
                icon={<CalendarDays className="w-4 h-4 text-primary" />}
                count={upcomingMatches.length}
                viewAllHref="/football"
              />
              {loading ? (
                <MatchListSkeleton count={6} />
              ) : upcomingMatches.length === 0 ? (
                <EmptyState
                  title="No upcoming games right now"
                  description="Check back soon or browse the football page."
                />
              ) : (
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  {upcomingMatches.slice(0, 12).map((match) => (
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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
      <p className="font-semibold text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}
