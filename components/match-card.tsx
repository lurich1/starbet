'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ExternalLink, Lock } from 'lucide-react'
import type { Match, BetSelection } from '@/lib/types'
import { getBettingState } from '@/lib/match-betting'
import {
  MARKET_1X2,
  isSelected,
  make1X2Selection,
} from '@/lib/bet-slip-utils'
import { MarketsPanel } from '@/components/markets-panel'
import { getCountryFlag } from '@/lib/country-flags'

interface MatchCardProps {
  match: Match
  selections: BetSelection[]
  onToggleSelection: (sel: BetSelection) => void
}

export function MatchCard({ match, selections, onToggleSelection }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false)
  const betting = getBettingState(match)
  const closedLabel =
    betting.reason === 'finished'
      ? 'FINISHED'
      : betting.reason === 'ending-soon'
        ? 'CLOSING'
        : betting.reason === 'starting-soon'
          ? 'CLOSED'
          : betting.reason === 'started'
            ? 'STARTED'
            : null

  const hasMarkets = !!match.markets

  return (
    <div
      className={`bg-card border rounded-xl overflow-hidden transition-colors ${
        betting.closed
          ? 'border-border opacity-90'
          : 'border-border hover:border-primary/50'
      }`}
    >
      {/* League header */}
      <div className="px-3 sm:px-4 py-2 bg-secondary/50 flex items-center justify-between gap-2">
        <span className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wide truncate min-w-0 flex items-center gap-1.5">
          <span aria-hidden className="text-sm shrink-0">
            {getCountryFlag(match.country)}
          </span>
          <span className="truncate">
            {match.league}
            {match.country ? ` — ${match.country}` : ''}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-2 text-[11px] sm:text-xs">
          {closedLabel && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              {closedLabel}
            </span>
          )}
          {match.isLive ? (
            <span className="flex items-center gap-1.5 font-semibold text-live">
              <span className="w-1.5 h-1.5 bg-live rounded-full animate-pulse-live" />
              LIVE {match.minute}
            </span>
          ) : (
            <span className="text-muted-foreground font-medium">{match.startTime}</span>
          )}
        </span>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {/* Teams */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-[11px] font-bold shrink-0">
                {match.homeTeam.substring(0, 2).toUpperCase()}
              </div>
              <span className="font-medium text-sm truncate">{match.homeTeam}</span>
            </div>
            {match.isLive && (
              <span className="text-base font-bold shrink-0 tabular-nums">
                {match.homeScore ?? '-'}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-[11px] font-bold shrink-0">
                {match.awayTeam.substring(0, 2).toUpperCase()}
              </div>
              <span className="font-medium text-sm truncate">{match.awayTeam}</span>
            </div>
            {match.isLive && (
              <span className="text-base font-bold shrink-0 tabular-nums">
                {match.awayScore ?? '-'}
              </span>
            )}
          </div>
        </div>

        {/* Odds */}
        <div className="grid grid-cols-3 gap-2">
          <OddsButton
            label="1"
            value={match.odds.home}
            selected={isSelected(selections, match.id, MARKET_1X2, 'home')}
            disabled={betting.closed}
            onClick={() => onToggleSelection(make1X2Selection(match, 'home'))}
          />
          <OddsButton
            label="X"
            value={match.odds.draw}
            selected={isSelected(selections, match.id, MARKET_1X2, 'draw')}
            disabled={betting.closed || match.odds.draw <= 0}
            onClick={() => onToggleSelection(make1X2Selection(match, 'draw'))}
          />
          <OddsButton
            label="2"
            value={match.odds.away}
            selected={isSelected(selections, match.id, MARKET_1X2, 'away')}
            disabled={betting.closed}
            onClick={() => onToggleSelection(make1X2Selection(match, 'away'))}
          />
        </div>

        {betting.closed && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            {betting.reason === 'ending-soon' && 'Betting suspended — match ending soon.'}
            {betting.reason === 'finished' && 'Match finished — betting closed.'}
            {betting.reason === 'starting-soon' &&
              `Betting closed — kick-off in ${betting.minutesRemaining ?? 0} min.`}
            {betting.reason === 'started' && 'Match has started — betting closed.'}
          </p>
        )}

        {hasMarkets && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[11px] sm:text-xs text-primary hover:underline"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Hide markets' : 'More markets'}
            </button>
            <Link
              href={`/football/match/${match.id}`}
              className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground hover:text-primary"
            >
              All markets
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}

        {expanded && hasMarkets && (
          <div className="pt-1">
            <MarketsPanel
              match={match}
              selections={selections}
              onToggle={onToggleSelection}
              closed={betting.closed}
              compact
            />
          </div>
        )}
      </div>
    </div>
  )
}

function OddsButton({
  label,
  value,
  selected,
  disabled,
  onClick,
}: {
  label: string
  value: number
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center py-2.5 rounded-lg transition-all ${
        disabled
          ? 'bg-secondary/40 text-muted-foreground cursor-not-allowed opacity-60'
          : selected
            ? 'bg-primary text-primary-foreground active:scale-95'
            : 'bg-secondary hover:bg-secondary/80 active:scale-95'
      }`}
    >
      <span className="text-[10px] text-muted-foreground mb-0.5">{label}</span>
      <span className="font-bold text-base tabular-nums">{value.toFixed(2)}</span>
    </button>
  )
}
