'use client'

// Tower Rush — Galaxsys-style "crash" tower-builder wired to the real wallet.
//
// All outcomes are decided server-side (app/api/games/tower-rush): the stake is
// debited on BUILD-from-idle (start), each extra BUILD asks the server whether
// the floor survives, and CASH OUT credits stake × coefficient. The crash floor
// is committed (hash shown) at start and revealed at settle, so it's provably
// fair and can't be predicted or forced from the client.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Info, Menu, Minus, Plus, ShieldCheck, X } from 'lucide-react'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import {
  TOWER_BLOCK_H,
  TOWER_BLOCK_W,
  TOWER_MIN_STAKE,
  TOWER_STACK_STRIDE,
  towerCoeffAt,
} from '@/lib/tower-rush'

const VISIBLE_FLOORS = 5
const RESET_MS = 1500

// Optional full-stage background illustration. Drop an image in /public and set
// this to its path (e.g. '/tower-bg.png') to replace the CSS scene with real
// art instantly. Leave null to use the built-in CSS street scene.
const TOWER_BG_IMAGE: string | null = null

type Phase = 'idle' | 'building' | 'crashed' | 'cashed'
type Tab = 'players' | 'history' | 'top'

interface HistoryRow { id: number; coeff: number; stake: number; payout: number; won: boolean }
interface PlayerRow { id: string; bet: number; win: number; time: string }
interface Fairness { hash: string | null; seed: string | null; crashFloor: number | null }

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const coeffStr = (n: number) => n.toFixed(2)

const maskId = () => {
  const a = Math.floor(10 + Math.random() * 89)
  const tail = Math.random() < 0.5
    ? Math.floor(10 + Math.random() * 89)
    : `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`
  return `${a}***${tail}`
}

export default function TowerRushPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<boolean | null>(null) // null = unknown/loading
  const [clientSeed, setClientSeed] = useState('')

  const [balance, setBalance] = useState(0)
  const [currency, setCurrency] = useState('NGN')
  const [bet, setBet] = useState(100)

  const [phase, setPhase] = useState<Phase>('idle')
  const [floor, setFloor] = useState(0)
  const [coeff, setCoeff] = useState(0)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fairness, setFairness] = useState<Fairness>({ hash: null, seed: null, crashFloor: null })
  // Win celebration splash (mirrors the football bet-won trophy display).
  const [win, setWin] = useState<{ amount: number; coeff: number; code: string } | null>(null)

  const [showInfo, setShowInfo] = useState(false)
  const [tab, setTab] = useState<Tab>('players')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [clock, setClock] = useState(9 * 60 + 13)
  const roundCounter = useRef(1)

  const building = phase === 'building'
  const crashed = phase === 'crashed'
  const canBet = (phase === 'idle' || phase === 'crashed' || phase === 'cashed') && !busy

  // ── Session + profile ─────────────────────────────────────────────────────
  useEffect(() => {
    setClientSeed(Math.random().toString(36).slice(2) + Date.now().toString(36))
    const id = getUserId()
    setUserId(id)
    if (!id) { setSignedIn(false); return }
    fetch(`/api/users/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u) {
          setBalance(Number(u.balance) || 0)
          if (u.currency) setCurrency(u.currency)
          setSignedIn(true)
        } else {
          setSignedIn(false)
        }
      })
      .catch(() => setSignedIn(false))
  }, [])

  // ── Sidebar clock ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock((c) => (c + 1) % (24 * 3600)), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Simulated live-players feed ──────────────────────────────────────────────
  useEffect(() => {
    const seed = (): PlayerRow => {
      const b = +(5 + Math.random() * 5000).toFixed(2)
      const mult = Math.random() < 0.55 ? +(0.97 + Math.random() * 4).toFixed(2) : 0
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

  const api = useCallback(
    async (action: string, extra: Record<string, unknown>) => {
      const res = await fetch('/api/games/tower-rush', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, userId, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      return data
    },
    [userId],
  )

  const scheduleReset = useCallback(() => {
    window.setTimeout(() => {
      setPhase('idle')
      setFloor(0)
      setCoeff(0)
      setRoundId(null)
      setMessage(null)
    }, RESET_MS)
  }, [])

  const pushHistory = (row: Omit<HistoryRow, 'id'>) =>
    setHistory((h) => [{ id: roundCounter.current++, ...row }, ...h].slice(0, 40))

  // BUILD: start a round (debits stake) or place the next floor.
  const build = useCallback(async () => {
    if (busy) return
    if (!userId) { setError('Please sign in to play.'); return }
    setError(null)

    if (phase === 'idle' || phase === 'crashed' || phase === 'cashed') {
      if (bet < TOWER_MIN_STAKE || bet > balance) { setError('Not enough balance'); return }
      setBusy(true)
      try {
        const d = await api('start', { stake: bet, clientSeed })
        setRoundId(d.roundId)
        setFloor(d.floor)
        setCoeff(d.coeff)
        setBalance(d.balance)
        if (d.currency) setCurrency(d.currency)
        setFairness({ hash: d.serverSeedHash, seed: null, crashFloor: null })
        setPhase('building')
        setMessage(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
      return
    }

    if (phase !== 'building' || !roundId) return
    setBusy(true)
    try {
      const d = await api('build', { roundId })
      if (d.crashed) {
        setFloor(d.floor)
        setPhase('crashed')
        setMessage('Tower collapsed!')
        setFairness((f) => ({ ...f, seed: d.serverSeed, crashFloor: d.crashFloor }))
        pushHistory({ coeff, stake: bet, payout: 0, won: false })
        scheduleReset()
      } else {
        setFloor(d.floor)
        setCoeff(d.coeff)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, userId, phase, bet, balance, clientSeed, roundId, coeff, api, scheduleReset])

  const cashOut = useCallback(async () => {
    if (busy || phase !== 'building' || !roundId) return
    setBusy(true)
    setError(null)
    try {
      const d = await api('cashout', { roundId })
      if (d.balance != null) setBalance(d.balance)
      setCoeff(d.coeff)
      setPhase('cashed')
      setMessage(`Cashed out x${coeffStr(d.coeff)} · +${fmt(d.payout)} ${currency}`)
      setFairness((f) => ({ ...f, seed: d.serverSeed, crashFloor: d.crashFloor }))
      pushHistory({ coeff: d.coeff, stake: bet, payout: d.payout, won: true })
      setWin({ amount: d.payout, coeff: d.coeff, code: (roundId ?? '').slice(0, 8).toUpperCase() })
      scheduleReset()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, phase, roundId, api, bet, currency, scheduleReset])

  // Keyboard: Space builds, Enter cashes out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); build() }
      else if (e.code === 'Enter' && building) { e.preventDefault(); cashOut() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [build, cashOut, building])

  const adjustBet = (delta: number) => {
    if (!canBet) return
    setBet((b) => Math.max(TOWER_MIN_STAKE, Math.min(balance || Infinity, Math.round((b + delta) * 100) / 100)))
  }
  const setBetSafe = (v: number) => {
    if (!canBet) return
    setBet(Math.max(TOWER_MIN_STAKE, Math.min(balance || Infinity, v)))
  }

  const scrollOffset = Math.max(0, (floor - VISIBLE_FLOORS) * TOWER_STACK_STRIDE)
  const minCoeff = towerCoeffAt(1)

  return (
    <div className="min-h-screen bg-[#0e1726] text-white flex flex-col">
      <style>{`
        @keyframes tr-drop { from { transform: translateY(-40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes tr-sway { 0%,100% { transform: translateX(-26px) rotate(-7deg) } 50% { transform: translateX(26px) rotate(7deg) } }
        @keyframes tr-fall { to { transform: translateY(420px) rotate(80deg); opacity: 0 } }
        .tr-block-in { animation: tr-drop .28s ease-out }
        .tr-sway { animation: tr-sway var(--sway, 1.1s) ease-in-out infinite; transform-origin: top center }
        .tr-fall { animation: tr-fall .9s ease-in forwards }
      `}</style>

      {/* ─── Win celebration splash (SportyBet-style, same as football) ─── */}
      {win && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center px-5 sm:px-6 bg-black/90 animate-in fade-in duration-300">
          <button
            type="button"
            onClick={() => setWin(null)}
            aria-label="Close"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" strokeWidth={2.5} />
          </button>

          <div className="mt-16 sm:mt-20 text-center">
            <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight drop-shadow-lg">YOU WON</p>
            <p className="mt-2 text-3xl sm:text-4xl font-bold text-white tabular-nums drop-shadow-md">
              {currency} {fmt(win.amount)}
            </p>
            <p className="mt-1 text-xl font-extrabold text-[#8effa1] tabular-nums">x{coeffStr(win.coeff)}</p>
          </div>

          <div className="relative flex-1 w-full mt-1 sm:mt-2 min-h-0 max-w-md">
            <Image
              src="/won_trophy_image.png"
              alt="Trophy"
              fill
              priority
              className="object-contain drop-shadow-[0_0_50px_rgba(255,200,0,0.55)]"
            />
          </div>

          {win.code && (
            <p className="mt-1 text-sm sm:text-base text-white text-center">
              <span className="font-medium text-white/80">Round: </span>
              <span className="font-mono font-bold tracking-wider tabular-nums">{win.code}</span>
            </p>
          )}

          <div className="mt-3 mb-6 w-full max-w-sm">
            <button
              type="button"
              onClick={() => setWin(null)}
              className="w-full h-12 rounded-xl bg-[#22c55e] hover:bg-[#1eae53] text-white font-black text-base"
            >
              Collect
            </button>
          </div>
        </div>
      )}

      <header className="h-12 px-4 flex items-center justify-between border-b border-white/10 bg-[#0b1220]">
        <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Lobby
        </Link>
        <div className="text-xs text-white/50">Home › Tower Rush</div>
        <div className="w-16" />
      </header>

      <main className="flex-1 w-full max-w-[1100px] mx-auto p-3 sm:p-4 flex flex-col lg:flex-row gap-4">
        {/* ===================== GAME STAGE ===================== */}
        <section className="relative flex-1 rounded-2xl overflow-hidden border border-black/30 shadow-2xl min-h-[460px]">
          <div className="absolute inset-0 bg-gradient-to-b from-[#6fb1d6] via-[#c3dbe0] to-[#f3c886]" />
          {/* The higher the tower climbs, the deeper the sky turns. */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#06204a] to-[#0a3a6e] pointer-events-none"
            style={{ opacity: Math.min(floor / 16, 1) * 0.7, transition: 'opacity .4s ease-out' }}
          />
          {/* Warm sunset glow behind the storefront */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-16 w-64 h-44 rounded-full bg-amber-300/70 blur-3xl pointer-events-none" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-20 w-28 h-28 rounded-full bg-orange-200/80 blur-2xl pointer-events-none" />

          {TOWER_BG_IMAGE ? (
            <Image src={TOWER_BG_IMAGE} alt="" fill priority className="object-cover object-bottom z-0" />
          ) : (
            <>
              {/* Soft clouds */}
              <Cloud className="top-10 left-[12%] w-24 h-8" />
              <Cloud className="top-24 left-[60%] w-32 h-10" />
              <Cloud className="top-40 left-[28%] w-20 h-7 opacity-80" />
              <Skyline />
            </>
          )}

          <div className="absolute top-3 left-3 z-20 select-none">
            <Image src="/tower-logo.png" alt="Tower Rush" width={120} height={120} priority className="w-20 sm:w-24 h-auto drop-shadow-lg" />
          </div>

          {/* Crane + hanging next block (centered over the column) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
            {/* arm + counterweight */}
            <div className="relative w-44 h-2 bg-gradient-to-b from-[#48566f] to-[#2f3c52] rounded-b shadow-md">
              <div className="absolute -left-1 top-0 w-3 h-3 bg-[#febb3c] rounded-sm" />
            </div>
            <div className="w-1.5 h-5 bg-[#2b3850]" />
            {/* hook pulley */}
            <div className="w-3 h-2 rounded-sm bg-[#febb3c] border border-[#3a2a00]" />
            {!crashed && (
              <div className="tr-sway flex flex-col items-center">
                <div className="w-0.5 h-7 bg-[#1f2a3d]" />
                <BrickBlock index={floor} />
              </div>
            )}
          </div>

          {/* Coefficient readout */}
          {floor > 0 && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 text-center">
              <div className={`text-5xl sm:text-6xl font-black tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] ${crashed ? 'text-red-400' : coeff >= 1 ? 'text-[#8effa1]' : 'text-white'}`}>
                x{coeffStr(coeff)}
              </div>
              {message && <div className={`mt-1 text-sm font-bold ${crashed ? 'text-red-300' : 'text-[#8effa1]'}`}>{message}</div>}
            </div>
          )}

          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-10"><Shop /></div>

          {/* Stacked tower (right-side column) */}
          <div
            className="absolute left-1/2 z-10"
            style={{ bottom: 86, transform: `translate(-50%, ${scrollOffset}px)`, transition: 'transform .3s ease-out' }}
          >
            {Array.from({ length: floor }).map((_, i) => (
              <div
                key={i}
                className={`tr-block-in ${crashed ? 'tr-fall' : ''}`}
                style={{
                  // Overlap each storey slightly so the tower reads as one
                  // connected building.
                  marginTop: i === 0 ? 0 : TOWER_STACK_STRIDE - TOWER_BLOCK_H,
                  // First floor drops at normal speed; every floor after snaps
                  // in fast.
                  animationDuration: crashed ? undefined : i === 0 ? '0.28s' : '0.12s',
                  animationDelay: crashed ? `${i * 40}ms` : undefined,
                }}
              >
                <BrickBlock index={i} />
              </div>
            ))}
          </div>

          {/* Provably-fair chip */}
          {fairness.hash && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] text-white/70">
              <ShieldCheck className="w-3 h-3 text-[#8effa1]" /> Provably fair
            </div>
          )}

          <button onClick={() => setShowInfo((s) => !s)} className="absolute bottom-3 right-3 z-30 w-8 h-8 rounded-full bg-white/85 text-[#1f3a93] flex items-center justify-center shadow" aria-label="Game info">
            <Info className="w-4 h-4" />
          </button>

          {showInfo && (
            <div className="absolute inset-0 z-40 bg-black/60 flex flex-col items-center justify-center text-center px-6 overflow-y-auto">
              <button onClick={() => setShowInfo(false)} className="absolute top-3 right-3 text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
              <div className="w-12 h-12 rounded-full bg-white/90 text-[#1f3a93] flex items-center justify-center mb-4"><Info className="w-6 h-6" /></div>
              <p className="text-lg font-semibold">Minimum Coefficient: <span className="text-[#ffd54a] font-black">x{coeffStr(minCoeff)}</span></p>
              <p className="text-lg font-semibold">Maximum Win Coefficient: <span className="text-[#ffd54a] font-black">Unlimited</span></p>
              <p className="mt-4 max-w-sm text-sm text-white/70">Press <b>BUILD</b> to stack a floor and grow the coefficient. <b>CASH OUT</b> before the tower collapses. Every floor above the base carries a collapse risk.</p>
              {fairness.hash && (
                <div className="mt-4 max-w-sm w-full text-left text-[11px] text-white/60 break-all space-y-1 bg-black/30 rounded-lg p-3">
                  <div><span className="text-white/40">Server seed hash:</span> {fairness.hash}</div>
                  <div><span className="text-white/40">Client seed:</span> {clientSeed}</div>
                  {fairness.seed && <div><span className="text-white/40">Server seed (revealed):</span> {fairness.seed}</div>}
                  {fairness.crashFloor != null && <div><span className="text-white/40">Crash floor:</span> {fairness.crashFloor}</div>}
                </div>
              )}
            </div>
          )}

          {/* Sign-in gate */}
          {signedIn === false && (
            <div className="absolute inset-0 z-40 bg-black/70 flex flex-col items-center justify-center text-center px-6">
              <p className="text-lg font-bold">Sign in to play Tower Rush</p>
              <p className="text-sm text-white/60 mt-1">You need a wallet to place real stakes.</p>
              <Link href="/login" className="mt-4 px-5 h-11 inline-flex items-center rounded-xl bg-[#febb3c] text-[#3a2a00] font-bold">Sign in</Link>
            </div>
          )}

          {/* ===================== CONTROLS ===================== */}
          <div className="absolute bottom-0 left-0 right-0 z-30 p-3">
            {error && (
              <div className="mx-auto max-w-[560px] mb-2 rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs text-red-200">{error}</div>
            )}
            <div className="mx-auto max-w-[560px] flex items-stretch gap-2">
              <div className="flex-1 rounded-xl bg-[#11192a]/90 border border-white/10 p-1.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1.5">
                  <button onClick={() => adjustBet(-10)} disabled={!canBet} className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                  <input value={bet} onChange={(e) => setBetSafe(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} disabled={!canBet} inputMode="decimal" className="w-24 bg-transparent text-center text-lg font-bold tabular-nums outline-none disabled:opacity-70" />
                  <button onClick={() => adjustBet(10)} disabled={!canBet} className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => setBetSafe(balance)} disabled={!canBet} className="h-9 rounded-lg bg-[#2563eb] hover:bg-[#1d4fd7] disabled:opacity-40 text-sm font-bold">ALL IN</button>
                  <button onClick={() => setBetSafe(bet * 2)} disabled={!canBet} className="h-9 rounded-lg bg-[#2563eb] hover:bg-[#1d4fd7] disabled:opacity-40 text-sm font-bold">x2</button>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <button
                  onClick={build}
                  disabled={busy || signedIn === false}
                  className="flex-1 rounded-xl font-black text-lg tracking-wide text-[#3a2a00] shadow-lg active:translate-y-0.5 transition-transform disabled:opacity-60"
                  style={{ background: 'repeating-linear-gradient(45deg,#febb3c 0 14px,#e6a82f 14px 28px)', border: '3px solid #3a2a00' }}
                >
                  {busy && !building ? 'BUILDING…' : building ? 'BUILD +1' : 'BUILD'}
                </button>
                {building && (
                  <button onClick={cashOut} disabled={busy} className="h-12 rounded-xl bg-[#22c55e] hover:bg-[#1eae53] disabled:opacity-60 shadow-lg active:translate-y-0.5 transition-transform flex flex-col items-center justify-center leading-none">
                    <span className="font-black text-sm">CASH OUT {formatMoney(+(bet * coeff).toFixed(2), currency)} {currency}</span>
                    <span className="text-[10px] font-bold text-white/80 mt-0.5">x{coeffStr(coeff)}</span>
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
              <div className="text-[11px] text-white/40">{userId ? `ID : ${userId.slice(0, 8)}` : 'ID : —'}</div>
              <div className="text-2xl font-black tabular-nums">{fmt(balance)} <span className="text-sm font-bold text-white/60">{currency}</span></div>
              <div className="text-xs text-white/40 mt-1">{clockStr}</div>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><Menu className="w-4 h-4" /></button>
          </div>

          <div className="rounded-2xl bg-[#11192a] border border-white/10 overflow-hidden flex-1 min-h-[360px] flex flex-col">
            <div className="p-1.5">
              <div className="grid grid-cols-3 bg-black/30 rounded-full p-1 text-xs font-bold">
                {(['players', 'history', 'top'] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`py-1.5 rounded-full capitalize transition-colors ${tab === t ? 'bg-[#febb3c] text-[#3a2a00]' : 'text-white/60 hover:text-white'}`}>{t}</button>
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

              {tab === 'history' && (history.length === 0
                ? <Empty text="No rounds yet — press BUILD." />
                : history.map((h) => (
                    <Line key={h.id} a={`x${coeffStr(h.coeff)}`} b={fmt(h.stake)} c={h.won ? fmt(h.payout) : '0.00'} d={h.won ? 'WIN' : 'LOSS'} good={h.won} />
                  )))}

              {tab === 'top' && players.slice().sort((x, y) => y.win - x.win).map((p, i) => (
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

// Block art. Add more files here and they'll be cycled per floor.
const TOWER_BLOCK_IMAGES = ['/build-tool-one.png']

// Until we have multiple block sprites, vary the single sprite per floor with
// subtle, natural tints so the tower doesn't read as the same house repeated.
const TOWER_BLOCK_TINTS = [
  'none',
  'brightness(1.08) saturate(1.05)',
  'brightness(0.93) saturate(1.12) hue-rotate(-8deg)',
  'brightness(1.02) saturate(0.92) hue-rotate(10deg)',
  'brightness(0.97) saturate(1.18) hue-rotate(18deg)',
]

function BrickBlock({ index = 0 }: { index?: number }) {
  const n = TOWER_BLOCK_IMAGES.length
  const src = TOWER_BLOCK_IMAGES[((index % n) + n) % n]
  // Only tint when we're repeating a single sprite; real variants get no tint.
  const tint = n > 1 ? 'none' : TOWER_BLOCK_TINTS[((index % TOWER_BLOCK_TINTS.length) + TOWER_BLOCK_TINTS.length) % TOWER_BLOCK_TINTS.length]
  return (
    <div className="relative" style={{ width: TOWER_BLOCK_W, height: TOWER_BLOCK_H }}>
      <Image
        src={src}
        alt=""
        fill
        sizes="120px"
        className="object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]"
        style={{ filter: tint === 'none' ? undefined : tint }}
      />
    </div>
  )
}

// Soft fluffy cloud (a few overlapping blurred blobs).
function Cloud({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute z-0 pointer-events-none ${className}`}>
      <div className="absolute inset-0 rounded-full bg-white/85 blur-[2px]" />
      <div className="absolute left-1/4 -top-1/3 w-2/3 h-full rounded-full bg-white/85 blur-[2px]" />
      <div className="absolute right-0 top-1/4 w-1/2 h-3/4 rounded-full bg-white/80 blur-[2px]" />
    </div>
  )
}

// A single facade with a window grid and an optional striped awning.
function Building({
  left, width, height, bottom, color, cols = 3, rows = 3, awning, awningColor = '#c0392b', shadow = true,
}: {
  left: string; width: number; height: number; bottom: number; color: string
  cols?: number; rows?: number; awning?: boolean; awningColor?: string; shadow?: boolean
}) {
  return (
    <div
      className="absolute rounded-t-sm"
      style={{ left, width, height, bottom, background: color, boxShadow: shadow ? 'inset -7px 0 0 rgba(0,0,0,0.10), inset 0 4px 0 rgba(255,255,255,0.10)' : undefined }}
    >
      {awning && (
        <div className="absolute -top-2.5 -left-1 -right-1 h-3 rounded-sm shadow-sm"
          style={{ background: `repeating-linear-gradient(90deg, ${awningColor} 0 10px, #f3efe6 10px 20px)` }} />
      )}
      <div className="grid gap-1 p-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols * rows }).map((_, j) => (
          <div key={j} className="aspect-square rounded-[2px] bg-[#7e94ad]/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]" />
        ))}
      </div>
    </div>
  )
}

// The green storefront — the lit base the tower is built on.
function Shop() {
  return (
    <div className="relative flex flex-col items-center drop-shadow-[0_8px_8px_rgba(0,0,0,0.3)]">
      {/* Glowing hanging sign */}
      <div className="relative z-10 -mb-0.5">
        <div className="px-2.5 py-0.5 rounded text-[10px] font-extrabold tracking-wide text-[#3a2a00] bg-gradient-to-b from-[#ffe07a] to-[#f4b836] border border-[#8a5a16] shadow-[0_0_12px_3px_rgba(244,184,54,0.6)]">
          TOWER&nbsp;RUSH
        </div>
      </div>
      {/* Cornice */}
      <div className="h-2 w-36 rounded-t-sm bg-[#1f4a37] border-x-2 border-t-2 border-[#163528]" />
      {/* Storefront body */}
      <div className="w-36 h-20 bg-gradient-to-b from-[#357a59] to-[#245540] border-x-4 border-b-4 border-[#173a2c] rounded-b-sm flex items-end justify-center gap-2 px-2.5 relative">
        {/* warm interior glow through the glass */}
        <div className="absolute inset-x-1.5 top-1.5 h-8 rounded-sm bg-gradient-to-b from-[#ffe9b0]/70 to-[#f3b85a]/30 border border-[#173a2c]/50" />
        {/* door */}
        <div className="relative w-9 h-12 bg-gradient-to-b from-[#2a5743] to-[#1a3a2c] rounded-t-sm border border-[#143025]">
          <div className="absolute right-1 top-1/2 w-1 h-1 rounded-full bg-[#ffe07a]" />
        </div>
        {/* window */}
        <div className="w-7 h-9 bg-[#ffe9b0]/55 rounded-sm border border-[#173a2c]/60 mb-0" />
      </div>
    </div>
  )
}

// Original cartoon street scene behind the tower — distant skyline, two
// flanking storefront rows with awnings, a lamp post, a picket fence, a paved
// street and a dirt cross-section.
function Skyline() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-56 z-0 pointer-events-none">
      {/* Distant skyline (hazy, warm) */}
      <Building left="2%" width={74} height={128} bottom={74} color="#b9aebd" cols={3} rows={4} shadow={false} />
      <Building left="14%" width={58} height={98} bottom={74} color="#c7b9a2" cols={2} rows={3} shadow={false} />
      <Building left="78%" width={70} height={120} bottom={74} color="#bdb0bf" cols={3} rows={4} shadow={false} />
      <Building left="90%" width={62} height={94} bottom={74} color="#c2b39c" cols={2} rows={3} shadow={false} />

      {/* Front storefronts (left & right of the shop) */}
      <Building left="-2%" width={132} height={104} bottom={40} color="#a9b0bb" cols={3} rows={3} />
      <Building left="20%" width={78} height={80} bottom={40} color="#c2ab84" cols={2} rows={2} awning awningColor="#caa24a" />
      <Building left="68%" width={92} height={112} bottom={40} color="#a594b6" cols={3} rows={3} awning awningColor="#b8362c" />
      <Building left="88%" width={108} height={86} bottom={40} color="#bda685" cols={3} rows={2} awning awningColor="#caa24a" />

      {/* Lamp post (left of centre) */}
      <div className="absolute" style={{ left: '40%', bottom: 40 }}>
        <div className="w-1.5 h-24 bg-gradient-to-b from-[#4a3a26] to-[#2e2417] rounded-t" />
        <div className="absolute -top-1 -left-2.5 w-6 h-3.5 rounded-md bg-[#f2c94c] shadow-[0_0_14px_4px_rgba(242,201,76,0.55)]" />
      </div>

      {/* Picket fence */}
      <div className="absolute left-0 right-0" style={{ bottom: 30, height: 16, background: 'repeating-linear-gradient(90deg,#cda775 0 11px,#b88f52 11px 13px)' }} />

      {/* Paved street */}
      <div className="absolute left-0 right-0" style={{ bottom: 24, height: 8, background: 'linear-gradient(#a9a9a9,#8f8f8f)' }} />

      {/* Dirt cross-section */}
      <div className="absolute left-0 right-0 bottom-0 h-6 overflow-hidden" style={{ background: 'linear-gradient(#6b4f33,#4a3624)' }}>
        {[
          ['10%', 3], ['24%', 5], ['38%', 4], ['52%', 6], ['66%', 4], ['80%', 5], ['92%', 3],
        ].map(([l, s], i) => (
          <span key={i} className="absolute rounded-full bg-[#3a2a1b]" style={{ left: l as string, bottom: 4 + (i % 2) * 6, width: s as number, height: s as number }} />
        ))}
      </div>
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
