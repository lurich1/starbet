'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BetSlip } from '@/components/bet-slip'
import { MobileNav } from '@/components/mobile-nav'
import { MarketsPanel } from '@/components/markets-panel'
import { useMatches } from '@/hooks/use-matches'
import { getBettingState } from '@/lib/match-betting'
import {
  make1X2Selection,
  removeSelectionById,
  toggleSelection,
  isSelected,
  MARKET_1X2,
} from '@/lib/bet-slip-utils'
import type { BetSelection } from '@/lib/types'

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>()
  const matchId = params?.id ?? ''
  const [selections, setSelections] = useState<BetSelection[]>([])

  const { matches, loading } = useMatches('football')
  const match = useMemo(() => matches.find((m) => m.id === matchId), [matches, matchId])

  const handleToggle = (sel: BetSelection) =>
    setSelections((prev) => toggleSelection(prev, sel))

  const handleRemove = (id: string) =>
    setSelections((prev) => removeSelectionById(prev, id))

  const handleClear = () => setSelections([])

  if (loading) {
    return (
      <CenteredMessage>
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading match…
      </CenteredMessage>
    )
  }

  if (!match) {
    return (
      <CenteredMessage>
        <span>Match not found.</span>
        <Link href="/football" className="text-primary hover:underline ml-2">
          Back to football
        </Link>
      </CenteredMessage>
    )
  }

  const betting = getBettingState(match)
  const closed = betting.closed

  return (
    <div className="min-h-screen bg-background pb-20 xl:pb-0">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center h-14 gap-4">
            <Link
              href="/football"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
              {match.homeTeam} vs {match.awayTeam}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/login">
                <Button variant="outline" size="sm" className="hidden sm:flex">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="hidden sm:flex bg-primary text-primary-foreground">
                  Register
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-4">
        <div className="flex gap-6">
          <main className="flex-1 min-w-0 space-y-4">
            {/* Match header */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
                <span className="uppercase tracking-wide">
                  {match.league}
                  {match.country ? ` — ${match.country}` : ''}
                </span>
                {match.isLive ? (
                  <span className="flex items-center gap-1.5 font-semibold text-live">
                    <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
                    LIVE {match.minute}
                  </span>
                ) : (
                  <span>{match.startTime}</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 py-2">
                <TeamBadge name={match.homeTeam} flagUrl={match.homeFlagUrl} />
                <div className="text-center">
                  {match.isLive ? (
                    <p className="text-3xl font-bold tabular-nums">
                      {match.homeScore ?? 0} : {match.awayScore ?? 0}
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-muted-foreground">vs</p>
                  )}
                </div>
                <TeamBadge name={match.awayTeam} flagUrl={match.awayFlagUrl} align="right" />
              </div>

              {closed && (
                <div className="mt-3 p-2 rounded-md bg-destructive/10 text-destructive text-xs flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  Betting closed —{' '}
                  {betting.reason === 'finished'
                    ? 'match finished.'
                    : betting.reason === 'starting-soon'
                      ? `kick-off in ${betting.minutesRemaining ?? 0} min.`
                      : betting.reason === 'admin-locked'
                        ? 'locked by admin.'
                        : 'match has started.'}
                </div>
              )}
            </div>

            {/* 1X2 — Match Result */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-3">Match Result</h2>
              <div className="grid grid-cols-3 gap-2">
                {(['home', 'draw', 'away'] as const).map((k) => {
                  const odds = match.odds[k]
                  const label = k === 'home' ? '1' : k === 'draw' ? 'X' : '2'
                  const teamLabel =
                    k === 'home' ? match.homeTeam : k === 'away' ? match.awayTeam : 'Draw'
                  const selected = isSelected(selections, match.id, MARKET_1X2, k)
                  const disabled = closed || odds <= 0
                  return (
                    <button
                      key={k}
                      onClick={() => handleToggle(make1X2Selection(match, k))}
                      disabled={disabled}
                      className={`flex flex-col items-center py-3 rounded-lg transition-all ${
                        disabled
                          ? 'bg-secondary/40 text-muted-foreground cursor-not-allowed opacity-60'
                          : selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary hover:bg-odds hover:text-primary-foreground'
                      }`}
                    >
                      <span className="text-[10px] opacity-80">
                        {label} — {teamLabel}
                      </span>
                      <span className="font-bold tabular-nums">{odds.toFixed(2)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* All other markets */}
            <MarketsPanel
              match={match}
              selections={selections}
              onToggle={handleToggle}
              closed={closed}
            />
          </main>

          <aside className="hidden lg:block w-80 shrink-0">
            <div className="sticky top-20">
              <BetSlip
                selections={selections}
                onRemoveSelection={handleRemove}
                onClearAll={handleClear}
                onLoadSelections={setSelections}
              />
            </div>
          </aside>
        </div>
      </div>

      <MobileNav
        selectedBets={selections}
        onRemoveSelection={handleRemove}
        onClearAll={handleClear}
        onLoadSelections={setSelections}
      />
    </div>
  )
}

function TeamBadge({
  name,
  flagUrl,
  align,
}: {
  name: string
  flagUrl?: string
  align?: 'right'
}) {
  const badge = flagUrl ? (
    <Image
      src={flagUrl}
      alt=""
      width={40}
      height={40}
      unoptimized
      className="w-10 h-10 rounded-full object-cover shrink-0 bg-secondary"
    />
  ) : (
    <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center text-xs font-bold shrink-0">
      {name.substring(0, 2).toUpperCase()}
    </div>
  )
  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${align === 'right' ? 'justify-end' : ''}`}>
      {align !== 'right' && badge}
      <span className={`font-semibold truncate ${align === 'right' ? 'text-right' : ''}`}>
        {name}
      </span>
      {align === 'right' && badge}
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
