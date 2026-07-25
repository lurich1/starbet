'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ExternalLink, Lock, Radio } from 'lucide-react'
import type { Match, BetSelection } from '@/lib/types'
import { getBettingState } from '@/lib/match-betting'
import {
  MARKET_1X2,
  isSelected,
  make1X2Selection,
} from '@/lib/bet-slip-utils'
import { MarketsPanel } from '@/components/markets-panel'
import { TeamCrest } from '@/components/team-crest'
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
      : betting.reason === 'starting-soon'
        ? 'CLOSED'
        : betting.reason === 'started'
          ? 'LIVE — LOCKED'
          : betting.reason === 'admin-locked'
            ? 'LOCKED'
            : null

  const hasMarkets = !!match.markets
  const isHalftime = match.isLive && match.minute === 'HT'

  return (
    <div
      className={`group bg-card border rounded-2xl overflow-hidden lift-on-hover transition-all duration-200 ${
        betting.closed
          ? 'border-border/70 opacity-95'
          : 'border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10'
      }`}
    >
      {/* League header strip */}
      <div className="px-3 sm:px-4 py-2 bg-gradient-to-r from-secondary/70 to-secondary/30 border-b border-border/60 flex items-center justify-between gap-2">
        <span className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate min-w-0 flex items-center gap-1.5">
          <span aria-hidden className="text-base shrink-0 leading-none">
            {getCountryFlag(match.country)}
          </span>
          <span className="truncate">
            {match.league}
            {match.country ? <span className="opacity-60"> · {match.country}</span> : null}
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
            isHalftime ? (
              <span className="font-bold uppercase tracking-wide text-amber-500 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10">
                HALFTIME
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-bold text-live text-[10px] px-1.5 py-0.5 rounded-full border border-live/30 bg-live/10 animate-live-glow">
                <Radio className="w-2.5 h-2.5" />
                LIVE {match.minute}
              </span>
            )
          ) : (
            <span className="text-muted-foreground font-medium tabular-nums">{match.startTime}</span>
          )}
        </span>
      </div>

      <div className="p-3 sm:p-4 space-y-3.5">
        {/* Teams + live scoreline */}
        <div className="space-y-2">
          <TeamRow
            name={match.homeTeam}
            url={match.homeFlagUrl}
            score={match.isLive ? (match.homeScore ?? 0) : undefined}
          />
          <TeamRow
            name={match.awayTeam}
            url={match.awayFlagUrl}
            score={match.isLive ? (match.awayScore ?? 0) : undefined}
          />
        </div>

        {/* Odds row */}
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
            {betting.reason === 'finished' && 'Match finished — betting closed.'}
            {betting.reason === 'starting-soon' &&
              `Betting closed — kick-off in ${betting.minutesRemaining ?? 0} min.`}
            {betting.reason === 'started' && 'Match has started — betting closed.'}
            {betting.reason === 'admin-locked' && 'Betting closed by admin.'}
          </p>
        )}

        {hasMarkets && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Hide markets' : 'More markets'}
            </button>
            <Link
              href={`/football/match/${match.id}`}
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              All markets
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}

        {expanded && hasMarkets && (
          <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
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

function TeamRow({
  name,
  url,
  score,
}: {
  name: string
  url?: string
  score?: number
}) {
  const showScore = typeof score === 'number'
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <TeamCrest name={name} url={url} size={32} />
        <span className="font-semibold text-sm truncate">{name}</span>
      </div>
      {showScore && (
        <span className="text-lg font-extrabold shrink-0 tabular-nums px-2 min-w-[2ch] text-center text-foreground">
          {score}
        </span>
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
      className={`relative flex flex-col items-center justify-center py-2.5 sm:py-3 rounded-xl font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed ${
        disabled
          ? 'bg-secondary/40 text-muted-foreground opacity-60'
          : selected
            ? 'bg-success text-success-foreground ring-1 ring-success/60 shadow-[0_6px_18px_-4px] shadow-success/50 scale-[0.98]'
            : 'bg-success/10 text-success ring-1 ring-success/20 hover:bg-success/20 hover:-translate-y-0.5 active:scale-95'
      }`}
    >
      <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${selected ? 'text-success-foreground/80' : 'text-success/70'}`}>
        {label}
      </span>
      <span className="text-lg sm:text-xl font-extrabold tabular-nums leading-none">
        {value.toFixed(2)}
      </span>
    </button>
  )
}
