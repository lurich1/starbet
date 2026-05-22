'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Home, Headphones, X, Sparkles, Check, Trophy, Share2 } from 'lucide-react'
import type { PlacedBet } from '@/lib/types'
import { hydrateLegacySelection } from '@/lib/bet-slip-utils'
import { getCountryFlag } from '@/lib/country-flags'
import { Button } from '@/components/ui/button'

const formatMoney = (n: number) =>
  n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface BetTicketDetailsProps {
  bet: PlacedBet
  open: boolean
  onClose: () => void
  userName?: string
}

/**
 * Won tickets get a big Congratulations + trophy splash first. Tap to
 * dismiss (or it auto-fades after 2 minutes). The ticket layout below
 * is unchanged.
 */
export function BetTicketDetails({ bet, open, onClose, userName }: BetTicketDetailsProps) {
  const [showTrophy, setShowTrophy] = useState(bet.status === 'won')

  useEffect(() => {
    if (open) setShowTrophy(bet.status === 'won')
  }, [open, bet.id, bet.status])

  useEffect(() => {
    if (!open || !showTrophy) return
    const t = setTimeout(() => setShowTrophy(false), 120_000)
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
  // 17-character verification code, deterministic per bet.
  // Format: PB-XXXXXX-YYYYYYYY (2 + 1 + 6 + 1 + 7 = 17), built from the
  // public ticket code + a slice of the bet UUID for added entropy.
  const idHex = bet.id.replace(/-/g, '').toUpperCase()
  const verificationCode = `PB-${ticketId.padEnd(6, '0').slice(0, 6)}-${idHex.slice(0, 7).padEnd(7, '0')}`

  const shareWin = () => {
    void navigator.share?.({
      title: 'Prime Bet — Won!',
      text: `Just won GHS ${formatMoney(totalReturn)} on Prime Bet (ticket ${ticketId})`,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-background flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ─── Won celebration splash (bigger trophy, opaque) ─── */}
      {won && showTrophy && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center px-6 pt-6 sm:pt-10 bg-background animate-in fade-in duration-300"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            You won big
          </p>
          <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-success tabular-nums">
            GHS {formatMoney(totalReturn)}
          </p>
          <p className="mt-2 text-base sm:text-lg font-bold text-foreground">
            Congratulations{userName ? `, ${userName}` : ''}!
          </p>

          {/* Big trophy */}
          <div className="relative flex-1 w-full max-w-[28rem] sm:max-w-[34rem] mt-3 sm:mt-4 min-h-0">
            <Image
              src="/won_trophy_image.png"
              alt="Trophy"
              fill
              priority
              className="object-contain drop-shadow-2xl"
            />
          </div>

          {/* Verification code container — 17 chars */}
          <div className="mt-3 w-full max-w-sm px-4 py-3 rounded-xl bg-card border border-primary/40 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">
              Verification Code
            </p>
            <p className="mt-1 text-base sm:text-lg font-extrabold font-mono tracking-[0.15em] text-primary text-center tabular-nums">
              {verificationCode}
            </p>
          </div>

          {/* Action buttons container — Details (left), Show Off (right) */}
          <div className="mt-3 mb-2 w-full max-w-sm flex gap-3 p-2 rounded-xl bg-card border border-border shadow-sm">
            <Button
              type="button"
              onClick={() => setShowTrophy(false)}
              variant="outline"
              className="flex-1 h-11 border-2 border-primary text-primary hover:bg-primary/10 font-bold"
            >
              Details
            </Button>
            <Button
              type="button"
              onClick={shareWin}
              className="flex-1 h-11 bg-amber-400 hover:bg-amber-500 text-black font-bold gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              Show Off
            </Button>
          </div>
        </div>
      )}

      {/* ─── Green app header (brand) ─── */}
      <header className="bg-primary text-primary-foreground">
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
      <section className="bg-[#1c1c1c] text-white relative overflow-hidden">
        {/* Trophy watermark for won tickets — bigger, still faded so ticket
            content stays clearly readable behind it. */}
        {won && (
          <Image
            src="/won_trophy_image.png"
            alt=""
            width={320}
            height={320}
            priority
            aria-hidden
            className="absolute -right-6 -top-4 w-56 h-56 sm:w-72 sm:h-72 object-contain opacity-30 pointer-events-none"
          />
        )}
        <div className="relative max-w-md mx-auto w-full px-4 pt-3 pb-4">
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
              {won ? formatMoney(totalReturn) : '0.00'}
            </p>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3 space-y-1 text-sm">
            <SummaryRow label="Total Stake" value={formatMoney(bet.stake)} />
            <SummaryRow label="Total Odds" value={bet.totalOdds.toFixed(2)} />
            {won && (
              <SummaryRow
                label="Potential Win"
                value={formatMoney(bet.potentialWin)}
              />
            )}
          </div>

          {/* Verification code — also on the ticket so the player can show
              this to a cashier without re-opening the splash. */}
          {won && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-success/10 border border-success/30 flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-widest text-white/70">
                Verification Code
              </span>
              <span className="text-base font-extrabold font-mono tracking-[0.3em] text-success">
                {ticketId}
              </span>
            </div>
          )}

          {/* Banner: congrats for won, remix for lost */}
          {won ? (
            <div className="mt-3 -mx-4 px-4 py-2.5 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">
                    Congratulations{userName ? `, "${userName}"` : ''}!
                  </p>
                  <p className="text-[11px] text-white/70">You are amazing!</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.share?.({
                    title: 'Prime Bet — Won!',
                    text: `Just won GHS ${formatMoney(totalReturn)} on Prime Bet (ticket ${ticketId})`,
                  })
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-400 hover:bg-amber-500 text-black font-bold text-[11px] shrink-0"
              >
                <Share2 className="w-3 h-3" />
                Show Off
              </button>
            </div>
          ) : lost ? (
            <div className="mt-3 -mx-4 px-4 py-2.5 bg-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0">🤖</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">
                    Bounce back fast — remix and retry your bet!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[11px] shrink-0"
              >
                <Sparkles className="w-3 h-3" />
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

          <div className="px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Number of Bets: 1</span>
            <span className="text-primary font-semibold cursor-pointer">
              Bet Details ›
            </span>
          </div>

          <div className="px-4 py-2.5 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-8"
              onClick={onClose}
            >
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
