'use client'

// Tower Rush — a Galaxsys-style "crash" tower-builder, recreated as a
// self-contained client-side DEMO (FUN money, no real wallet yet).
//
// Mechanic:
//   - Place a bet, press BUILD to lay the base floor (coefficient starts at
//     x0.4 — the game's minimum).
//   - Each extra BUILD stacks another brick floor and multiplies the
//     coefficient. Every floor above the base carries a collapse risk.
//   - CASH OUT any time to bank bet × current coefficient. If the tower
//     collapses first, the stake is lost. Max win is uncapped.
//
// The crash floor is drawn up-front from a geometric distribution so a round
// is decided at BUILD-time, not by animation timing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Info, Menu, Minus, Plus, X } from 'lucide-react'

// ---- Tunables -------------------------------------------------------------
const START_BALANCE = 100000 // FUN
const BASE_COEFF = 0.4 // coefficient after the base floor (the game minimum)
const GROWTH = 1.28 // coefficient multiplier per extra floor
const SURVIVE_P = 0.8 // chance each risky floor survives (→ ~20% collapse)
const BLOCK_W = 72
const BLOCK_H = 54
const VISIBLE_FLOORS = 5 // floors kept in frame before the tower scrolls down

type Phase = 'idle' | 'building' | 'crashed' | 'cashed'
type Tab = 'players' | 'history' | 'top'

interface HistoryRow {
  id: number
  coeff: number
  bet: number
  win: number
  won: boolean
}
interface PlayerRow {
  id: string
  bet: number
  win: number
  time: string
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// coefficient after `floors` floors placed (floors >= 1)
const coeffAt = (floors: number) =>
  floors <= 0 ? 0 : +(BASE_COEFF * Math.pow(GROWTH, floors - 1)).toFixed(2)

// Draw the floor at which the tower collapses (>= 2, base floor is always safe)
function genCrashFloor() {
  let f = 2
  while (Math.random() < SURVIVE_P) f++
  return f
}

const maskId = () => {
  const a = Math.floor(10 + Math.random() * 89)
  const b = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const c = Math.random() < 0.5 ? Math.floor(10 + Math.random() * 89) : `${b}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`
  return `${a}***${c}`
}

export default function TowerRushPage() {
  const [balance, setBalance] = useState(START_BALANCE)
  const [bet, setBet] = useState(100)
  const [phase, setPhase] = useState<Phase>('idle')
  const [floors, setFloors] = useState(0)
  const [crashFloor, setCrashFloor] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [tab, setTab] = useState<Tab>('players')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [clock, setClock] = useState(9 * 60 + 13)
  const roundId = useRef(1)

  const coeff = floors > 0 ? coeffAt(floors) : 0
  const building = phase === 'building'

  // Persist the demo balance so a refresh doesn't reset progress.
  useEffect(() => {
    const saved = Number(localStorage.getItem('towerRushBalance'))
    if (Number.isFinite(saved) && saved > 0) setBalance(saved)
  }, [])
  useEffect(() => {
    localStorage.setItem('towerRushBalance', String(balance))
  }, [balance])

  // Ticking clock for the sidebar header.
  useEffect(() => {
    const t = setInterval(() => setClock((c) => (c + 1) % (24 * 3600)), 1000)
    return () => clearInterval(t)
  }, [])

  // Seed + drift a simulated live-players feed.
  useEffect(() => {
    const seed = (): PlayerRow => {
      const b = +(5 + Math.random() * 5000).toFixed(2)
      const mult = Math.random() < 0.55 ? +(0.4 + Math.random() * 4).toFixed(2) : 0
      return { id: maskId(), bet: b, win: +(b * mult).toFixed(2), time: '09:12' }
    }
    setPlayers(Array.from({ length: 12 }, seed))
    const t = setInterval(() => {
      setPlayers((prev) => {
        const next = [...prev]
        next.unshift(seed())
        next.pop()
        return next
      })
    }, 2200)
    return () => clearInterval(t)
  }, [])

  const clockStr = useMemo(() => {
    const m = Math.floor(clock / 60) % 60
    const s = clock % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [clock])

  const canBet = phase === 'idle' || phase === 'crashed' || phase === 'cashed'

  const adjustBet = (delta: number) => {
    if (!canBet) return
    setBet((b) => Math.max(1, Math.min(balance, Math.round((b + delta) * 100) / 100)))
  }
  const setBetSafe = (v: number) => {
    if (!canBet) return
    setBet(Math.max(1, Math.min(balance, v)))
  }

  // BUILD: start a round, or lay the next floor.
  const build = useCallback(() => {
    if (canBet) {
      if (bet <= 0 || bet > balance) {
        setMessage('Not enough balance')
        return
      }
      // Start a new round.
      setBalance((b) => +(b - bet).toFixed(2))
      setCrashFloor(genCrashFloor())
      setFloors(1)
      setPhase('building')
      setMessage(null)
      return
    }
    if (phase !== 'building') return
    const next = floors + 1
    if (next >= crashFloor) {
      // Collapse — stake already deducted at round start.
      setFloors(next)
      setPhase('crashed')
      setMessage('Tower collapsed!')
      const id = roundId.current++
      setHistory((h) => [{ id, coeff: coeffAt(floors), bet, win: 0, won: false }, ...h].slice(0, 40))
      window.setTimeout(() => {
        setPhase('idle')
        setFloors(0)
        setMessage(null)
      }, 1300)
      return
    }
    setFloors(next)
  }, [canBet, bet, balance, phase, floors, crashFloor])

  const cashOut = useCallback(() => {
    if (phase !== 'building' || floors < 1) return
    const win = +(bet * coeffAt(floors)).toFixed(2)
    setBalance((b) => +(b + win).toFixed(2))
    setPhase('cashed')
    setMessage(`Cashed out x${coeffAt(floors)} · +${fmt(win)}`)
    const id = roundId.current++
    setHistory((h) => [{ id, coeff: coeffAt(floors), bet, win, won: true }, ...h].slice(0, 40))
    window.setTimeout(() => {
      setPhase('idle')
      setFloors(0)
      setMessage(null)
    }, 1500)
  }, [phase, floors, bet])

  // Keyboard: Space builds, Enter cashes out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); build() }
      else if (e.code === 'Enter' && building) { e.preventDefault(); cashOut() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [build, cashOut, building])

  const scrollOffset = Math.max(0, (floors - VISIBLE_FLOORS) * BLOCK_H)
  const crashed = phase === 'crashed'

  return (
    <div className="min-h-screen bg-[#0e1726] text-white flex flex-col">
      <style>{`
        @keyframes tr-drop { from { transform: translateY(-40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes tr-sway { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(3deg) } }
        @keyframes tr-fall { to { transform: translateY(420px) rotate(80deg); opacity: 0 } }
        .tr-block-in { animation: tr-drop .28s ease-out }
        .tr-sway { animation: tr-sway 2.4s ease-in-out infinite; transform-origin: top center }
        .tr-fall { animation: tr-fall .9s ease-in forwards }
      `}</style>

      {/* Top bar */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-white/10 bg-[#0b1220]">
        <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Lobby
        </Link>
        <div className="text-xs text-white/50">Home › Free Demo</div>
        <div className="w-16" />
      </header>

      <main className="flex-1 w-full max-w-[1100px] mx-auto p-3 sm:p-4 flex flex-col lg:flex-row gap-4">
        {/* ===================== GAME STAGE ===================== */}
        <section className="relative flex-1 rounded-2xl overflow-hidden border border-black/30 shadow-2xl min-h-[460px]">
          {/* Sky */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#7ec8f0] via-[#a9dcf5] to-[#e9d9b8]" />
          {/* Sun glow */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-24 w-40 h-40 rounded-full bg-yellow-200/70 blur-2xl" />

          {/* Skyline */}
          <Skyline />

          {/* Logo */}
          <div className="absolute top-3 left-3 z-20 select-none">
            <div className="font-extrabold leading-none drop-shadow-[0_2px_0_rgba(0,0,0,0.25)]">
              <div className="text-2xl sm:text-3xl text-[#ffd54a] tracking-tight" style={{ WebkitTextStroke: '1.5px #1f3a93' }}>TOWER</div>
              <div className="text-xl sm:text-2xl text-white tracking-[0.2em]" style={{ WebkitTextStroke: '1.5px #1f3a93' }}>RUSH</div>
            </div>
          </div>

          {/* Crane + hanging next block */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
            <div className="w-40 h-1.5 bg-[#3a4a63] rounded-b" />
            <div className="w-1 h-6 bg-[#2b3850]" />
            {!crashed && (
              <div className="tr-sway flex flex-col items-center">
                <div className="w-0.5 h-8 bg-[#1f2a3d]" />
                <BrickBlock />
              </div>
            )}
          </div>

          {/* Coefficient readout */}
          {floors > 0 && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 text-center">
              <div
                className={`text-5xl sm:text-6xl font-black tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] ${
                  crashed ? 'text-red-400' : coeff >= 1 ? 'text-[#8effa1]' : 'text-white'
                }`}
              >
                x{fmt(coeff)}
              </div>
              {message && (
                <div className={`mt-1 text-sm font-bold ${crashed ? 'text-red-300' : 'text-[#8effa1]'}`}>{message}</div>
              )}
            </div>
          )}

          {/* The shop (base of the tower) */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-10">
            <Shop />
          </div>

          {/* Stacked tower (grows up from just above the shop) */}
          <div
            className="absolute left-1/2 z-10"
            style={{ bottom: 86, transform: `translate(-50%, ${scrollOffset}px)`, transition: 'transform .3s ease-out' }}
          >
            {Array.from({ length: floors }).map((_, i) => (
              <div
                key={i}
                className={`tr-block-in ${crashed ? 'tr-fall' : ''}`}
                style={{ marginTop: i === 0 ? 0 : 2, animationDelay: crashed ? `${i * 40}ms` : undefined }}
              >
                <BrickBlock />
              </div>
            ))}
          </div>

          {/* Info button + caption */}
          <button
            onClick={() => setShowInfo((s) => !s)}
            className="absolute bottom-3 right-3 z-30 w-8 h-8 rounded-full bg-white/85 text-[#1f3a93] flex items-center justify-center shadow"
            aria-label="Game info"
          >
            <Info className="w-4 h-4" />
          </button>

          {showInfo && (
            <div className="absolute inset-0 z-40 bg-black/55 flex flex-col items-center justify-center text-center px-6">
              <button onClick={() => setShowInfo(false)} className="absolute top-3 right-3 text-white/80 hover:text-white">
                <X className="w-6 h-6" />
              </button>
              <div className="w-12 h-12 rounded-full bg-white/90 text-[#1f3a93] flex items-center justify-center mb-4">
                <Info className="w-6 h-6" />
              </div>
              <p className="text-lg font-semibold">
                Minimum Coefficient: <span className="text-[#ffd54a] font-black">x0.4</span>
              </p>
              <p className="text-lg font-semibold">
                Maximum Win Coefficient: <span className="text-[#ffd54a] font-black">Unlimited</span>
              </p>
              <p className="mt-4 max-w-sm text-sm text-white/70">
                Press <b>BUILD</b> to stack a floor and grow the coefficient. <b>CASH OUT</b> before the tower
                collapses. Every floor above the base carries a collapse risk.
              </p>
            </div>
          )}

          {/* ===================== CONTROLS ===================== */}
          <div className="absolute bottom-0 left-0 right-0 z-30 p-3">
            <div className="mx-auto max-w-[560px] flex items-stretch gap-2">
              {/* Bet stepper + quick bets */}
              <div className="flex-1 rounded-xl bg-[#11192a]/90 border border-white/10 p-1.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1.5">
                  <button onClick={() => adjustBet(-10)} disabled={!canBet} className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center">
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    value={bet}
                    onChange={(e) => setBetSafe(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                    disabled={!canBet}
                    inputMode="decimal"
                    className="w-24 bg-transparent text-center text-lg font-bold tabular-nums outline-none disabled:opacity-70"
                  />
                  <button onClick={() => adjustBet(10)} disabled={!canBet} className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => setBetSafe(balance)} disabled={!canBet} className="h-9 rounded-lg bg-[#2563eb] hover:bg-[#1d4fd7] disabled:opacity-40 text-sm font-bold">
                    ALL IN
                  </button>
                  <button onClick={() => setBetSafe(bet * 2)} disabled={!canBet} className="h-9 rounded-lg bg-[#2563eb] hover:bg-[#1d4fd7] disabled:opacity-40 text-sm font-bold">
                    x2
                  </button>
                </div>
              </div>

              {/* Build / Cash out */}
              <div className="flex-1 flex flex-col gap-2">
                <button
                  onClick={build}
                  className="flex-1 rounded-xl font-black text-lg tracking-wide text-[#3a2a00] shadow-lg active:translate-y-0.5 transition-transform"
                  style={{
                    background: 'repeating-linear-gradient(45deg,#febb3c 0 14px,#e6a82f 14px 28px)',
                    border: '3px solid #3a2a00',
                  }}
                >
                  {canBet ? 'BUILD' : 'BUILD +1'}
                </button>
                {building && (
                  <button
                    onClick={cashOut}
                    className="h-12 rounded-xl bg-[#22c55e] hover:bg-[#1eae53] font-black text-base shadow-lg active:translate-y-0.5 transition-transform"
                  >
                    CASH OUT x{fmt(coeff)}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SIDEBAR ===================== */}
        <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-3">
          <div className="rounded-2xl bg-[#11192a] border border-white/10 p-4 flex items-start justify-between">
            <div>
              <div className="text-[11px] text-white/40">ID : 0</div>
              <div className="text-2xl font-black tabular-nums">
                {fmt(balance)} <span className="text-sm font-bold text-white/60">FUN</span>
              </div>
              <div className="text-xs text-white/40 mt-1">{clockStr}</div>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Menu className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-2xl bg-[#11192a] border border-white/10 overflow-hidden flex-1 min-h-[360px] flex flex-col">
            <div className="p-1.5">
              <div className="grid grid-cols-3 bg-black/30 rounded-full p-1 text-xs font-bold">
                {(['players', 'history', 'top'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`py-1.5 rounded-full capitalize transition-colors ${
                      tab === t ? 'bg-[#febb3c] text-[#3a2a00]' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-3 flex-1 overflow-y-auto">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] uppercase tracking-wide text-white/35 py-2 sticky top-0 bg-[#11192a]">
                <span>Player ID</span><span className="text-right">Bet</span><span className="text-right">Win</span><span className="text-right">Time</span>
              </div>

              {tab === 'players' && players.map((p, i) => (
                <Line key={`${p.id}-${i}`} a={p.id} b={fmt(p.bet)} c={p.win > 0 ? fmt(p.win) : '—'} d={p.time} good={p.win > 0} />
              ))}

              {tab === 'history' && (
                history.length === 0
                  ? <Empty text="No rounds yet — press BUILD." />
                  : history.map((h) => (
                      <Line key={h.id} a={`x${fmt(h.coeff)}`} b={fmt(h.bet)} c={h.won ? fmt(h.win) : '0.00'} d={h.won ? 'WIN' : 'LOSS'} good={h.won} />
                    ))
              )}

              {tab === 'top' && players
                .slice()
                .sort((x, y) => y.win - x.win)
                .map((p, i) => (
                  <Line key={`top-${p.id}-${i}`} a={p.id} b={fmt(p.bet)} c={fmt(p.win)} d={`#${i + 1}`} good />
                ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

// ---- Presentational bits --------------------------------------------------

function BrickBlock() {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: BLOCK_W,
        height: BLOCK_H,
        borderRadius: 6,
        background: 'repeating-linear-gradient(0deg,#b0432e 0 12px,#9c3a27 12px 13px), #a83f2b',
        boxShadow: 'inset 0 0 0 3px #7d2e1e, 0 3px 4px rgba(0,0,0,0.35)',
      }}
    >
      <div className="w-7 h-7 rounded-full bg-[#f3ead3] border-[3px] border-[#cdbf9e] flex items-center justify-center">
        <div className="w-full h-[3px] bg-[#cdbf9e]" />
        <div className="absolute w-[3px] h-7 bg-[#cdbf9e]" />
      </div>
    </div>
  )
}

function Shop() {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] font-bold text-[#5a3a1a] bg-[#e8c98a] px-3 rounded-t-md border border-[#5a3a1a]/40">Tower Rush</div>
      <div className="w-28 h-16 bg-[#2f6b4f] rounded-b-md border-x-4 border-b-4 border-[#234f3b] flex items-end justify-center relative">
        <div className="absolute -top-1 left-0 right-0 h-2 bg-[repeating-linear-gradient(90deg,#c0392b_0_8px,#ecf0f1_8px_16px)]" />
        <div className="w-8 h-10 bg-[#1c3d2e] rounded-t-md mb-0" />
      </div>
    </div>
  )
}

function Skyline() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-44 z-0">
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#b9a98a]" />
      {[
        { l: '4%', w: 80, h: 110, c: '#c9c2b6' },
        { l: '16%', w: 60, h: 90, c: '#d7d0c4' },
        { l: '70%', w: 90, h: 120, c: '#cfc7ba' },
        { l: '84%', w: 70, h: 100, c: '#bcb4a6' },
      ].map((b, i) => (
        <div key={i} className="absolute bottom-12 rounded-t-sm" style={{ left: b.l, width: b.w, height: b.h, background: b.c }}>
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {Array.from({ length: 9 }).map((_, j) => (
              <div key={j} className="aspect-square bg-[#8aa0b8]/60 rounded-[2px]" />
            ))}
          </div>
        </div>
      ))}
      {/* Ground / dirt strip */}
      <div className="absolute bottom-0 left-0 right-0 h-3 bg-[#6b4f33]" />
    </div>
  )
}

function Line({ a, b, c, d, good }: { a: string; b: string; c: string; d: string; good?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center py-2 border-b border-white/5 text-xs">
      <span className="text-white/80 truncate">{a}</span>
      <span className="text-right tabular-nums text-[#7fb3ff]">{b}</span>
      <span className={`text-right tabular-nums ${good ? 'text-[#8effa1]' : 'text-white/40'}`}>{c}</span>
      <span className="text-right text-white/35">{d}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-xs text-white/40">{text}</div>
}
