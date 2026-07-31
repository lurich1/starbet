'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, X, Check, Trophy, Share2, Copy } from 'lucide-react'
import type { PlacedBet } from '@/lib/types'
import { hydrateLegacySelection } from '@/lib/bet-slip-utils'
import { Button } from '@/components/ui/button'

import { formatMoney as fmtMoney } from '@/lib/format-money'

const formatMoney = (n: number, currency?: string) => fmtMoney(n, currency)

// Winning-ticket palette — deliberately GREEN, independent of the red brand
// (mirrors SportyBet: red app, green won-ticket).
const GREEN_CARD = 'bg-gradient-to-br from-[#1e7d4d] via-[#136a3e] to-[#0d5431]'
const GOLD = '#f5c518'
const RESULT_GREEN = '#33c46f'

interface BetTicketDetailsProps {
  bet: PlacedBet
  open: boolean
  onClose: () => void
  userName?: string
}

/**
 * Won tickets get a full-screen "YOU WON" splash first (tap to dismiss, or it
 * auto-fades after 2 minutes). Below sits the green summary card, gold "You
 * Won!" banner, booking code, and the navy per-selection result cards.
 */
export function BetTicketDetails({ bet, open, onClose, userName }: BetTicketDetailsProps) {
  const [showTrophy, setShowTrophy] = useState(bet.status === 'won')
  const [copied, setCopied] = useState(false)

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
  const bonus = won && bet.payout && bet.payout > bet.potentialWin ? bet.payout - bet.potentialWin : 0
  const placedAt = new Date(bet.placedAt)
  const stampLabel = placedAt
    .toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '')
  const ticketId = bet.code
  const cur = bet.currency ?? 'GHS'

  const shareWin = () => {
    void navigator.share?.({
      title: 'Betfus — Won!',
      text: `Just won ${cur} ${formatMoney(totalReturn, cur)} on Betfus (ticket ${ticketId})`,
    })
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(ticketId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-[#f1f3f6] flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ─── Full-screen "YOU WON" splash ─── */}
      {won && showTrophy && (
        <div className="absolute inset-0 z-20 flex flex-col items-center bg-black/65 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <h2
              className="text-white text-5xl sm:text-6xl font-black tracking-tight drop-shadow-lg"
              style={{ textShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
            >
              YOU WON
            </h2>
            <p
              className="mt-2 text-3xl sm:text-4xl font-extrabold tabular-nums"
              style={{ color: GOLD, textShadow: '0 3px 12px rgba(0,0,0,0.35)' }}
            >
              {cur} {formatMoney(totalReturn, cur)}
            </p>
            <div className="relative mt-6 w-56 h-56 sm:w-64 sm:h-64">
              <div aria-hidden className="absolute inset-0 m-auto w-40 h-40 rounded-full bg-amber-300/30 blur-3xl" />
              <Image
                src="/won_trophy_image.png"
                alt="Trophy"
                fill
                priority
                className="object-contain drop-shadow-[0_16px_32px_rgba(245,197,24,0.45)]"
              />
            </div>
          </div>
          <div className="w-full max-w-md mx-auto px-5 pb-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowTrophy(false)}
              className="h-13 py-3.5 rounded-2xl border-2 border-white/70 text-white font-bold text-base active:scale-[0.98] transition-transform"
            >
              Details
            </button>
            <button
              type="button"
              onClick={shareWin}
              className="h-13 py-3.5 rounded-2xl bg-[#1fae5a] hover:bg-[#1a9c50] text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
            >
              <Share2 className="w-4 h-4" />
              Show Off
            </button>
          </div>
        </div>
      )}

      {/* ─── Light header ─── */}
      <header className="bg-card/95 backdrop-blur border-b border-border shrink-0">
        <div className="max-w-md mx-auto w-full px-4 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/70 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-extrabold text-base tracking-wide uppercase">Ticket Details</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-secondary text-muted-foreground flex items-center justify-center hover:bg-secondary/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ─── Scrollable body ─── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto w-full px-4 py-4 space-y-4">
          {/* Green summary card */}
          <section className={`relative overflow-hidden rounded-2xl ${won ? GREEN_CARD : 'bg-gradient-to-br from-slate-700 to-slate-800'} text-white shadow-lg`}>
            {won && (
              <Image
                src="/won_trophy_image.png"
                alt=""
                width={220}
                height={220}
                aria-hidden
                className="absolute -right-6 -top-6 w-40 h-40 object-contain opacity-20 pointer-events-none"
              />
            )}
            <div className="relative p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono font-bold tracking-wider text-[15px]">{ticketId}</span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/25 text-xs font-extrabold uppercase">
                  {won ? (
                    <>
                      <Trophy className="w-3.5 h-3.5" style={{ color: GOLD }} />
                      Won
                    </>
                  ) : lost ? (
                    'Lost'
                  ) : (
                    <span className="text-amber-300">Pending</span>
                  )}
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/60 font-semibold">Total Stake</p>
                  <p className="text-xl font-extrabold tabular-nums mt-0.5">
                    {cur} {formatMoney(bet.stake, cur)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-white/60 font-semibold">Total Return</p>
                  <p className="text-xl font-extrabold tabular-nums mt-0.5" style={won ? { color: GOLD } : undefined}>
                    {cur} {formatMoney(totalReturn, cur)}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between gap-2 text-xs text-white/75">
                <span className="tabular-nums">{stampLabel}</span>
                <span>Odds: <span className="font-bold text-white tabular-nums">{bet.totalOdds.toFixed(2)}</span></span>
                {bonus > 0 && (
                  <span>Bonus: <span className="font-bold text-white tabular-nums">{cur} {formatMoney(bonus, cur)}</span></span>
                )}
              </div>
            </div>
          </section>

          {/* Gold "You Won!" banner */}
          {won && (
            <section className="rounded-2xl bg-[#f5c518] flex items-center justify-between gap-3 px-4 py-3.5 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-[#8a6d00]" />
                </span>
                <div className="min-w-0">
                  <p className="font-extrabold text-[#3d3000] leading-tight">You Won!</p>
                  {userName && (
                    <p className="text-xs font-semibold text-[#7a6200] uppercase truncate">{userName}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={shareWin}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#3d3000] text-[#f5c518] font-extrabold text-xs uppercase tracking-wide active:scale-95 transition-transform"
              >
                Show Off
              </button>
            </section>
          )}

          {/* Booking code card */}
          <section className="rounded-2xl bg-card border border-border flex items-center justify-between gap-3 px-4 py-3.5 shadow-sm">
            <span className="text-sm font-semibold text-muted-foreground">Booking Code</span>
            <button
              type="button"
              onClick={copyCode}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors"
            >
              <span className="font-mono font-bold tracking-wider text-sm">{ticketId}</span>
              {copied ? (
                <Check className="w-4 h-4 text-success" strokeWidth={3} />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </section>

          {/* Selections */}
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-1">
            Selections ({bet.selections.length})
          </p>

          <div className="space-y-3">
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
              const hasFtScore =
                settled &&
                (s.match.homeScore !== undefined || s.match.awayScore !== undefined)
              const ftScore = hasFtScore
                ? `${s.match.homeScore ?? 0} - ${s.match.awayScore ?? 0}`
                : null
              const legWon = legStatus === 'won'
              const legLost = legStatus === 'lost'
              const accent = legWon ? RESULT_GREEN : legLost ? '#e5484d' : '#64748b'
              // Kick-off time for this match (not the bet-placed time).
              const koDate = s.match.startTimeISO ? new Date(s.match.startTimeISO) : null
              const kickoffLabel =
                koDate && !Number.isNaN(koDate.getTime())
                  ? `${koDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} ${koDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                  : s.match.startTime ?? ''
              return (
                <div
                  key={s.id ?? `${idx}-${s.matchId}`}
                  className="relative overflow-hidden rounded-2xl bg-[#152238] text-white shadow-sm"
                >
                  {/* Left accent bar */}
                  <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: accent }} />

                  <div className="pl-5 pr-4 py-3.5">
                    {/* Row: date/time + FT score */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white/60 tabular-nums">
                        {kickoffLabel}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {settled && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-white/70">FT</span>
                        )}
                        {ftScore && <span className="text-sm font-extrabold tabular-nums">{ftScore}</span>}
                      </span>
                    </div>

                    {/* Teams */}
                    <p className="mt-1.5 text-sm font-bold truncate">
                      {s.match.homeTeam} <span className="text-white/50 font-normal">v</span> {s.match.awayTeam}
                    </p>

                    {/* Verify code */}
                    {settled && (
                      <p className="mt-2 text-[11px] font-semibold flex items-center gap-1.5 flex-wrap">
                        <span className="text-white/50 uppercase tracking-wide">Verify Code:</span>
                        <span className="font-mono font-bold tracking-wider" style={{ color: RESULT_GREEN }}>
                          {ticketId}
                        </span>
                      </p>
                    )}

                    {/* Market / Pick / Result sub-panel */}
                    <div className="mt-2.5 rounded-xl bg-black/25 px-3.5 py-2.5 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-white/45 font-semibold">Market</p>
                        <p className="text-sm font-semibold mt-0.5">{s.marketLabel}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-white/45 font-semibold">Pick</p>
                        <p className="text-sm font-semibold mt-0.5 truncate">
                          {pick} <span className="text-white/60 font-normal tabular-nums">@{s.odds.toFixed(2)}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-white/45 font-semibold">Result</p>
                        <p className="text-sm font-bold mt-0.5 flex items-center justify-end gap-1" style={{ color: accent }}>
                          {legWon ? (
                            <>
                              {pick}
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            </>
                          ) : legLost ? (
                            <>
                              {ftScore ?? 'Lost'}
                              <X className="w-3.5 h-3.5" strokeWidth={3} />
                            </>
                          ) : (
                            <span className="text-amber-300">Pending</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Lost helper */}
          {lost && (
            <div className="rounded-2xl bg-card border border-border flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Bounce back — remix and retry your bet.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground font-bold text-xs"
              >
                Remix Bet
              </button>
            </div>
          )}

          <Button variant="outline" className="w-full h-11" onClick={onClose}>
            Close
          </Button>
        </div>
      </main>
    </div>
  )
}
