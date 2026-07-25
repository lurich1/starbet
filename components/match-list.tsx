'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { Match, BetSelection } from '@/lib/types'
import { getBettingState } from '@/lib/match-betting'
import {
  MARKET_1X2,
  isSelected,
  make1X2Selection,
} from '@/lib/bet-slip-utils'
import { MarketsPanel } from '@/components/markets-panel'
import { TeamCrest } from '@/components/team-crest'
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
      <div className="rounded-xl overflow-hidden border border-border bg-card">
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

      {/* 1 X 2 column header (SportyBet-style) */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 -mb-2">
        <span className="flex-1" />
        <div className="grid grid-cols-3 gap-1.5 w-[50%] max-w-[220px] text-center text-xs font-bold text-muted-foreground">
          <span>1</span>
          <span>X</span>
          <span>2</span>
        </div>
      </div>

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
          <div className="rounded-xl overflow-hidden border border-border bg-card">
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
            <div className="rounded-xl overflow-hidden border border-border bg-card">
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
      : betting.reason === 'started'
        ? 'LIVE — LOCKED'
        : betting.reason === 'starting-soon'
          ? 'CLOSED'
          : betting.reason === 'admin-locked'
            ? 'LOCKED'
            : null

  const hasMarkets = !!match.markets

  const marketCount = match.markets ? Object.keys(match.markets).length : 0

  return (
    <div
      className={`bg-card px-3 sm:px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
        betting.closed ? 'opacity-90' : 'hover:bg-secondary/30'
      }`}
    >
      {/* Meta line: status + id + league */}
      <div className="flex items-center gap-2 mb-2 text-xs min-w-0">
        {match.isLive ? (
          match.minute === 'HT' ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold uppercase text-[10px] shrink-0">
              HT
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-live/15 text-live font-bold text-[10px] flex items-center gap-1 shrink-0 animate-pulse-live">
              <span className="w-1.5 h-1.5 rounded-full bg-live" />
              LIVE {match.minute}
            </span>
          )
        ) : (
          <span className="font-bold text-foreground tabular-nums shrink-0">{match.startTime}</span>
        )}
        {match.demo && (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold uppercase text-[10px] shrink-0">
            SIM
          </span>
        )}
        {closedLabel && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10 flex items-center gap-1 shrink-0">
            <Lock className="w-2.5 h-2.5" />
            {closedLabel}
          </span>
        )}
        <span className="text-muted-foreground shrink-0">ID {match.id.slice(0, 6)}</span>
        {showLeague && (
          <span className="text-muted-foreground truncate flex items-center gap-1 min-w-0">
            <span aria-hidden>{getCountryFlag(match.country)}</span>
            <span className="truncate">{match.league}</span>
          </span>
        )}
      </div>

      {/* Body: teams (left) + optional live score + odds grid (right) */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Link href={`/football/match/${match.id}`} className="flex-1 min-w-0 space-y-1 hover:opacity-80">
          <p className="font-semibold text-sm truncate flex items-center gap-1.5">
            <TeamCrest name={match.homeTeam} url={match.homeFlagUrl} size={18} className="rounded-sm shrink-0" />
            <span className="truncate">{match.homeTeam}</span>
          </p>
          <p className="font-semibold text-sm truncate flex items-center gap-1.5">
            <TeamCrest name={match.awayTeam} url={match.awayFlagUrl} size={18} className="rounded-sm shrink-0" />
            <span className="truncate">{match.awayTeam}</span>
          </p>
          {hasMarkets && marketCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setExpanded((v) => !v)
              }}
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              +{marketCount}
              <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </Link>

        {match.isLive && (
          <div className="flex flex-col items-center justify-center gap-1 text-sm font-extrabold tabular-nums text-foreground shrink-0 px-1">
            <span>{match.homeScore ?? '-'}</span>
            <span>{match.awayScore ?? '-'}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5 w-[50%] max-w-[220px] shrink-0">
          <OddsBtn
            label={match.odds.home.toFixed(2)}
            selected={isSelected(selections, match.id, MARKET_1X2, 'home')}
            disabled={betting.closed}
            onClick={() => onToggle(make1X2Selection(match, 'home'))}
          />
          {match.odds.draw > 0 ? (
            <OddsBtn
              label={match.odds.draw.toFixed(2)}
              selected={isSelected(selections, match.id, MARKET_1X2, 'draw')}
              disabled={betting.closed}
              onClick={() => onToggle(make1X2Selection(match, 'draw'))}
            />
          ) : (
            <OddsBtn label="—" selected={false} disabled onClick={() => {}} />
          )}
          <OddsBtn
            label={match.odds.away.toFixed(2)}
            selected={isSelected(selections, match.id, MARKET_1X2, 'away')}
            disabled={betting.closed}
            onClick={() => onToggle(make1X2Selection(match, 'away'))}
          />
        </div>
      </div>

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
      aria-pressed={selected}
      className={`h-11 rounded-md text-sm font-bold tabular-nums transition-all ${
        disabled
          ? 'bg-secondary/50 text-muted-foreground/50 cursor-not-allowed'
          : selected
            ? 'bg-success text-success-foreground shadow-sm'
            : 'bg-success/10 text-success hover:bg-success/20 active:scale-95'
      }`}
    >
      {label}
    </button>
  )
}
