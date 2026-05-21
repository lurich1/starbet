'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ExternalLink, Lock } from 'lucide-react'
import { Match, BetSelection } from '@/lib/types'
import { getBettingState } from '@/lib/match-betting'
import {
  MARKET_1X2,
  isSelected,
  make1X2Selection,
} from '@/lib/bet-slip-utils'
import { MarketsPanel } from '@/components/markets-panel'
import { getCountryFlag } from '@/lib/country-flags'

interface MatchListProps {
  matches: Match[]
  title?: string
  showLeague?: boolean
  selectedBets: BetSelection[]
  onToggleSelection: (sel: BetSelection) => void
}

export function MatchList({
  matches,
  title,
  showLeague = true,
  selectedBets,
  onToggleSelection,
}: MatchListProps) {
  const liveMatches = matches.filter((m) => m.isLive)
  const upcomingMatches = matches.filter((m) => !m.isLive)

  const groupByLeague = (list: Match[]) =>
    list.reduce((acc, match) => {
      if (!acc[match.league]) acc[match.league] = []
      acc[match.league].push(match)
      return acc
    }, {} as Record<string, Match[]>)

  const renderLeagueGroup = (leagueName: string, leagueMatches: Match[]) => (
    <div key={leagueName} className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <span className="w-1 h-4 bg-primary rounded-full" />
        {leagueName}
      </h3>
      <div className="space-y-2">
        {leagueMatches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            selections={selectedBets}
            onToggle={onToggleSelection}
            showLeague={false}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {title && <h2 className="text-xl font-bold text-foreground">{title}</h2>}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              liveMatches.length > 0 ? 'bg-live animate-pulse-live' : 'bg-muted-foreground/40'
            }`}
          />
          Live Now
          {liveMatches.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({liveMatches.length})
            </span>
          )}
        </h3>
        {liveMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No live matches right now. Check back later.
          </p>
        ) : showLeague ? (
          Object.entries(groupByLeague(liveMatches)).map(([league, list]) =>
            renderLeagueGroup(league, list),
          )
        ) : (
          <div className="space-y-2">
            {liveMatches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                selections={selectedBets}
                onToggle={onToggleSelection}
                showLeague={showLeague}
              />
            ))}
          </div>
        )}
      </div>

      {upcomingMatches.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Upcoming</h3>
          {showLeague ? (
            Object.entries(groupByLeague(upcomingMatches)).map(([league, list]) =>
              renderLeagueGroup(league, list),
            )
          ) : (
            <div className="space-y-2">
              {upcomingMatches.map((m) => (
                <MatchRow
                  key={m.id}
                  match={m}
                  selections={selectedBets}
                  onToggle={onToggleSelection}
                  showLeague={showLeague}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MatchRow({
  match,
  selections,
  onToggle,
  showLeague,
}: {
  match: Match
  selections: BetSelection[]
  onToggle: (sel: BetSelection) => void
  showLeague: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const betting = getBettingState(match)
  const closedLabel =
    betting.reason === 'finished'
      ? 'FINISHED'
      : betting.reason === 'ending-soon'
        ? 'CLOSING'
        : betting.reason === 'starting-soon' || betting.reason === 'started'
          ? 'CLOSED'
          : null

  const hasMarkets = !!match.markets

  return (
    <div
      className={`bg-card border border-border rounded-lg p-3 sm:p-4 transition-colors ${
        betting.closed ? 'opacity-90' : 'hover:border-primary/50'
      }`}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {match.isLive ? (
            <span className="px-2 py-0.5 bg-live/20 text-live text-[10px] sm:text-xs font-semibold rounded animate-pulse-live flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 bg-live rounded-full" />
              LIVE {match.minute}
            </span>
          ) : (
            <span className="text-xs sm:text-sm text-muted-foreground">{match.startTime}</span>
          )}
          {match.demo && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-500 bg-amber-500/10 shrink-0">
              DEMO
            </span>
          )}
          {closedLabel && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10 flex items-center gap-1 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              {closedLabel}
            </span>
          )}
        </div>
        {showLeague && (
          <span className="text-[10px] sm:text-xs text-muted-foreground truncate flex items-center gap-1">
            <span aria-hidden>{getCountryFlag(match.country)}</span>
            <span className="truncate">{match.league}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <Link
          href={`/football/match/${match.id}`}
          className="flex-1 min-w-0 hover:opacity-80"
        >
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="font-medium text-foreground text-sm sm:text-base truncate">
              {match.homeTeam}
            </span>
            {match.isLive && (
              <span className="font-bold text-foreground shrink-0">{match.homeScore}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground text-sm sm:text-base truncate">
              {match.awayTeam}
            </span>
            {match.isLive && (
              <span className="font-bold text-foreground shrink-0">{match.awayScore}</span>
            )}
          </div>
        </Link>

        <div className="flex gap-1.5 sm:gap-2 shrink-0">
          <OddsBtn
            label={match.odds.home.toFixed(2)}
            selected={isSelected(selections, match.id, MARKET_1X2, 'home')}
            disabled={betting.closed}
            onClick={() => onToggle(make1X2Selection(match, 'home'))}
          />
          {match.odds.draw > 0 && (
            <OddsBtn
              label={match.odds.draw.toFixed(2)}
              selected={isSelected(selections, match.id, MARKET_1X2, 'draw')}
              disabled={betting.closed}
              onClick={() => onToggle(make1X2Selection(match, 'draw'))}
            />
          )}
          <OddsBtn
            label={match.odds.away.toFixed(2)}
            selected={isSelected(selections, match.id, MARKET_1X2, 'away')}
            disabled={betting.closed}
            onClick={() => onToggle(make1X2Selection(match, 'away'))}
          />
        </div>
      </div>

      {hasMarkets && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide markets' : 'More markets'}
          </button>
          <Link
            href={`/football/match/${match.id}`}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          >
            Details
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

      {expanded && hasMarkets && (
        <div className="mt-3">
          <MarketsPanel
            match={match}
            selections={selections}
            onToggle={onToggle}
            closed={betting.closed}
            compact
          />
        </div>
      )}
    </div>
  )
}

function OddsBtn({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-11 sm:w-14 h-9 sm:h-10 rounded-md text-xs sm:text-sm font-semibold transition-all ${
        disabled
          ? 'bg-secondary/40 text-muted-foreground cursor-not-allowed opacity-60'
          : selected
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary hover:bg-odds text-foreground hover:text-primary-foreground'
      }`}
    >
      {label}
    </button>
  )
}
