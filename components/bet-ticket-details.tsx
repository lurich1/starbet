'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Home, Headphones, X, Sparkles, Check, Trophy } from 'lucide-react'
import type { PlacedBet } from '@/lib/types'
import { hydrateLegacySelection } from '@/lib/bet-slip-utils'
import { getCountryFlag } from '@/lib/country-flags'
import { Button } from '@/components/ui/button'

interface BetTicketDetailsProps {
  bet: PlacedBet
  open: boolean
  onClose: () => void
  userName?: string
}

/**
 * Sportybet-style ticket details view. Won bets get a trophy celebration
 * splash first (auto-fades or tap-through) before showing the receipt.
 */
export function BetTicketDetails({ bet, open, onClose, userName }: BetTicketDetailsProps) {
  const [showTrophy, setShowTrophy] = useState(bet.status === 'won')

  // Reset trophy splash any time the modal is reopened.
  useEffect(() => {
    if (open) setShowTrophy(bet.status === 'won')
  }, [open, bet.id, bet.status])

  // Auto-fade the trophy after 4 seconds so the player still sees the ticket.
  useEffect(() => {
    if (!open || !showTrophy) return
    const t = setTimeout(() => setShowTrophy(false), 4000)
    return () => clearTimeout(t)
  }, [open, showTrophy])

  if (!open) return null

  const settled = bet.status !== 'pending'
  const won = bet.status === 'won'
  const lost = bet.status === 'lost'
  const totalReturn = won ? (bet.payout ?? bet.potentialWin) : 0
  const placedAt = new Date(bet.placedAt)
  const dateLabel = placedAt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
  })
  const timeLabel = placedAt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const ticketId = bet.code

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col">
      {/* ─── Trophy celebration splash (won only) ─── */}
      {won && showTrophy && (
        <button
          type="button"
          onClick={() => setShowTrophy(false)}
          aria-label="Tap to view ticket"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background animate-in fade-in duration-300"
        >
          <div className="relative w-64 h-64 sm:w-80 sm:h-80">
            <Image
              src="/won trophy image.jpg"
              alt="Trophy"
              fill
              priority
              className="object-contain"
            />
          </div>
          <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">
            Congratulations
          </p>
          <p className="mt-1 text-3xl sm:text-4xl font-extrabold text-success tabular-nums">
            GHS {totalReturn.toFixed(2)}
          </p>
          <p className="mt-2 text-sm text-foreground">You won!</p>
          <p className="mt-6 text-[11px] text-muted-foreground">Tap to view ticket</p>
        </button>
      )}

      {/* ─── Red app header ─── */}
      <header className="bg-destructive text-destructive-foreground">
        <div className="max-w-md mx-auto w-full px-4 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <h1 className="font-bold text-base">Ticket Details</h1>
          <div className="flex items-center gap-2 opacity-90">
            <Headphones className="w-5 h-5" />
            <Home className="w-5 h-5" />
          </div>
        </div>
      </header>

      {/* ─── Dark summary header ─── */}
      <section className="bg-[#1c1c1c] text-white">
        <div className="max-w-md mx-auto w-full px-4 pt-3 pb-4">
          <div className="flex items-start justify-between text-xs text-white/60">
            <span>Ticket ID: {ticketId}</span>
            <span className="tabular-nums">
              {dateLabel}, {timeLabel}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-lg font-bold">
              {bet.selections.length > 1 ? 'Multiple' : 'Singles'}
            </p>
            {won ? (
              <span className="flex items-center gap-1.5 text-success font-bold">
                <Trophy className="w-4 h-4" />
                Won
              </span>
            ) : lost ? (
              <span className="font-bold text-white/80">Lost</span>
            ) : (
              <span className="font-bold text-amber-400">Pending</span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-white/70">Total Return</p>
            <p
              className={`text-2xl font-extrabold tabular-nums ${
                won ? 'text-success' : 'text-white'
              }`}
            >
              {won
                ? totalReturn.toLocaleString('en-GB', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : '0.00'}
            </p>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3 space-y-1 text-sm">
            <SummaryRow label="Total Stake" value={bet.stake.toFixed(2)} />
            <SummaryRow label="Total Odds" value={bet.totalOdds.toFixed(2)} />
            {won && (
              <SummaryRow
                label="Potential Win"
                value={bet.potentialWin.toFixed(2)}
              />
            )}
          </div>

          {/* Banner: congrats for won, remix for lost */}
          {won ? (
            <div className="mt-4 -mx-4 px-4 py-3 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    Congratulations{userName ? `, "${userName}"` : ''}!
                  </p>
                  <p className="text-xs text-white/70">You are amazing!</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.share?.({
                    title: 'Prime Bet — Won!',
                    text: `Just won GHS ${totalReturn.toFixed(2)} on Prime Bet (ticket ${ticketId})`,
                  })
                }}
                className="px-3 py-2 rounded-md bg-amber-400 hover:bg-amber-500 text-black font-bold text-sm shrink-0"
              >
                Show Off
              </button>
            </div>
          ) : lost ? (
            <div className="mt-4 -mx-4 px-4 py-3 bg-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl shrink-0">🤖</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    Bounce back fast — remix and retry your bet!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                Remix Bet
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ─── Match list ─── */}
      <main className="flex-1 overflow-y-auto bg-card">
        <div className="max-w-md mx-auto w-full">
          {bet.selections.map((raw, idx) => {
            const s = hydrateLegacySelection(raw)
            const legStatus = s.status ?? (settled ? bet.status : 'pending')
            const pick =
              s.selection === 'home'
                ? s.match.homeTeam
                : s.selection === 'away'
                  ? s.match.awayTeam
                  : s.selection === 'draw'
                    ? 'Draw'
                    : s.outcomeLabel
            return (
              <div
                key={s.id ?? `${idx}-${s.matchId}`}
                className="border-b border-border px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1 shrink-0">
                    {legStatus === 'won' ? (
                      <span className="w-6 h-6 rounded-full bg-success text-success-foreground flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    ) : legStatus === 'lost' ? (
                      <span className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                        <X className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full border-2 border-border" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span aria-hidden>{getCountryFlag(s.match.country)}</span>
                      <span className="truncate">
                        {s.match.league} · Game ID: {s.matchId.slice(0, 6)}
                      </span>
                    </p>
                    <p className="text-sm font-bold text-foreground truncate mt-0.5">
                      {s.match.homeTeam} <span className="text-muted-foreground font-normal">v</span>{' '}
                      {s.match.awayTeam}
                    </p>
                    {settled && (s.match.homeScore !== undefined || s.match.awayScore !== undefined) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        FT Score{' '}
                        <span className="text-foreground font-semibold tabular-nums">
                          {s.match.homeScore ?? 0}:{s.match.awayScore ?? 0}
                        </span>
                      </p>
                    )}

                    <div
                      className={`mt-2 p-2.5 rounded-md text-xs ${
                        legStatus === 'won'
                          ? 'bg-success/10 border border-success/20'
                          : legStatus === 'lost'
                            ? 'bg-destructive/5 border border-destructive/20'
                            : 'bg-secondary border border-border'
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Pick</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {pick}@{s.odds.toFixed(2)}
                          {legStatus === 'won' && (
                            <Check className="inline w-3 h-3 ml-1 text-success" strokeWidth={3} />
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 mt-1">
                        <span className="text-muted-foreground">Market</span>
                        <span className="font-medium text-foreground">{s.marketLabel}</span>
                      </div>
                      <div className="flex justify-between gap-2 mt-1">
                        <span className="text-muted-foreground">Outcome</span>
                        <span className="font-medium text-foreground">{s.outcomeLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="px-4 py-4 flex items-center justify-between text-sm text-foreground">
            <span>Number of Bets: 1</span>
            <span className="text-primary font-semibold cursor-pointer">Bet Details ›</span>
          </div>

          <div className="px-4 py-3 border-t border-border">
            <Button variant="outline" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-white/70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}
