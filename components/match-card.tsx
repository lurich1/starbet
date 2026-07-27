'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ExternalLink, Lock, MessageSquareMore } from 'lucide-react'
import type { Match, BetSelection } from '@/lib/types'
import { getBettingState } from '@/lib/match-betting'
import {
  MARKET_1X2,
  isSelected,
  make1X2Selection,
} from '@/lib/bet-slip-utils'
import { MarketsPanel } from '@/components/markets-panel'

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
      : betting.reason === 'starting-soon'
        ? 'CLOSED'
        : betting.reason === 'started'
          ? 'LIVE — LOCKED'
          : betting.reason === 'admin-locked'
            ? 'LOCKED'
            : null

  const hasMarkets = !!match.markets
  const isHalftime = match.isLive && match.minute === 'HT'
  const marketCount = match.markets
    ? Object.keys(match.markets).length
    : 0

  return (
    <div
      className={`group bg-card border rounded-xl px-3 py-2.5 transition-colors ${
        betting.closed
          ? 'border-border/70 opacity-95'
          : 'border-border hover:border-primary/40'
      }`}
    >
      {/* Header line: minute/time · live chip · league */}
      <div className="flex items-center gap-2 text-[11px] min-w-0">
        {match.isLive ? (
          <>
            <span className="font-bold text-primary tabular-nums shrink-0">{match.minute}</span>
            {!isHalftime && (
              <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-live/15 text-live border border-live/30">
                Live
              </span>
            )}
          </>
        ) : (
          <span className="font-semibold text-foreground tabular-nums shrink-0">{match.startTime}</span>
        )}
        <Link
          href={`/football/match/${match.id}`}
          className="text-muted-foreground hover:text-primary truncate min-w-0 hover:underline"
        >
          {match.league}
          {match.country ? <span className="opacity-60"> · {match.country}</span> : null}
        </Link>
        {closedLabel && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10">
            <Lock className="w-2.5 h-2.5" />
            {closedLabel}
          </span>
        )}
      </div>

      {/* Body: teams (left) + odds (right) */}
      <div className="mt-2 flex items-stretch gap-2.5">
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-0.5">
          <TeamLine name={match.homeTeam} score={match.isLive ? (match.homeScore ?? 0) : undefined} />
          <TeamLine name={match.awayTeam} score={match.isLive ? (match.awayScore ?? 0) : undefined} />
        </div>

        <div className="grid grid-cols-3 gap-1.5 w-[56%] sm:w-[52%] shrink-0">
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
      </div>

      {/* Footer: more markets + all markets */}
      {hasMarkets && (
        <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageSquareMore className="w-3.5 h-3.5" />
            +{marketCount > 0 ? marketCount : ''} markets
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <Link
            href={`/football/match/${match.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            All markets
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

      {betting.closed && !hasMarkets && (
        <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Lock className="w-3 h-3" />
          {betting.reason === 'finished' && 'Match finished — betting closed.'}
          {betting.reason === 'starting-soon' &&
            `Betting closed — kick-off in ${betting.minutesRemaining ?? 0} min.`}
          {betting.reason === 'started' && 'Match has started — betting closed.'}
          {betting.reason === 'admin-locked' && 'Betting closed by admin.'}
        </p>
      )}

      {expanded && hasMarkets && (
        <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
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
  )
}

function TeamLine({ name, score }: { name: string; score?: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-[13px] truncate min-w-0">{name}</span>
      {typeof score === 'number' && (
        <span className="text-sm font-extrabold tabular-nums shrink-0 text-foreground">{score}</span>
      )}
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
      aria-pressed={selected}
      className={`relative flex flex-col items-center justify-center h-11 rounded-lg font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed ${
        disabled
          ? 'bg-secondary/40 text-muted-foreground opacity-60'
          : selected
            ? 'bg-success text-success-foreground ring-1 ring-success/60'
            : 'bg-success/10 text-success ring-1 ring-success/20 hover:bg-success/20 active:scale-95'
      }`}
    >
      <span className={`text-[9px] font-bold uppercase leading-none mb-0.5 ${selected ? 'text-success-foreground/80' : 'text-success/60'}`}>
        {label}
      </span>
      <span className="text-sm font-extrabold tabular-nums leading-none">
        {value > 0 ? value.toFixed(2) : '—'}
      </span>
    </button>
  )
}
