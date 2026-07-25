'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Flame, Sparkles, Trophy } from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { MeSubpageHeader } from '@/components/me-subpage-header'
import { getUserId } from '@/lib/user-session'

const STORAGE_KEY = 'primebet:streak'
const DAY_MS = 86_400_000

interface StoredStreak {
  current: number
  best: number
  /** ISO date string for the day the streak was last extended (YYYY-MM-DD). */
  lastDay: string
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayKey(): string {
  return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10)
}

function loadStreak(userId: string): StoredStreak {
  if (typeof window === 'undefined') return { current: 0, best: 0, lastDay: '' }
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`)
    if (raw) return JSON.parse(raw) as StoredStreak
  } catch {
    /* ignore */
  }
  return { current: 0, best: 0, lastDay: '' }
}

function saveStreak(userId: string, s: StoredStreak) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export default function StreakPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [streak, setStreak] = useState<StoredStreak>({ current: 0, best: 0, lastDay: '' })

  // On first mount: claim today's check-in if not already claimed.
  useEffect(() => {
    const uid = getUserId()
    setUserId(uid)
    if (!uid) return
    const today = todayKey()
    const stored = loadStreak(uid)
    if (stored.lastDay === today) {
      setStreak(stored)
      return
    }
    // Extend if yesterday was claimed, otherwise reset.
    const next: StoredStreak = {
      current: stored.lastDay === yesterdayKey() ? stored.current + 1 : 1,
      best: 0,
      lastDay: today,
    }
    next.best = Math.max(next.current, stored.best)
    saveStreak(uid, next)
    setStreak(next)
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => i + 1), [])

  if (!userId) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-20 max-w-lg mx-auto w-full">
        <MeSubpageHeader title="Daily Streak" />
        <main className="flex-1 px-6 pt-12 text-center max-w-sm mx-auto w-full">
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div aria-hidden className="absolute inset-0 rounded-full bg-primary/15 blur-xl" />
            <div className="relative w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-card">
              <Flame className="w-9 h-9 text-primary" />
            </div>
          </div>
          <h2 className="text-title font-bold mb-1.5">Sign in to start your streak</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Visit Betfus 7 days in a row to unlock the streak badge.
          </p>
          <div className="flex gap-3">
            <Link href="/login" className="flex-1 h-12 inline-flex items-center justify-center rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary/10 transition-colors">Login</Link>
            <Link href="/register" className="flex-1 h-12 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-card hover:shadow-card-hover hover:-translate-y-0.5">Register</Link>
          </div>
        </main>
        <MobileNav selectedBets={[]} activeTab="me" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 max-w-lg mx-auto w-full">
      <MeSubpageHeader title="Daily Streak" />

      <main className="flex-1 px-3 sm:px-4 pt-4 space-y-4">
        {/* Streak hero */}
        <section className="relative rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 text-white overflow-hidden shadow-card">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '14px 14px',
            }}
          />
          <div aria-hidden className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/20 blur-3xl" />
          <div className="relative p-5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/85">
                Current streak
              </p>
              <p className="text-display font-black tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                {streak.current}
                <span className="text-xl font-extrabold uppercase tracking-wide ml-2">
                  day{streak.current === 1 ? '' : 's'}
                </span>
              </p>
              <p className="text-xs text-white/85 mt-1">
                Best: <span className="font-bold tabular-nums">{streak.best}</span> day{streak.best === 1 ? '' : 's'}
              </p>
            </div>
            <Flame className="w-20 h-20 text-white/40" strokeWidth={1.25} />
          </div>
        </section>

        {/* 7-day grid */}
        <section className="bg-card border border-border rounded-2xl p-4 shadow-card">
          <p className="text-eyebrow text-muted-foreground mb-3">This week</p>
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => {
              const claimed = d <= streak.current
              const isToday = d === Math.min(streak.current, 7)
              return (
                <div
                  key={d}
                  className={`aspect-square rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums transition-all ${
                    claimed
                      ? 'bg-primary text-primary-foreground shadow-card'
                      : 'bg-secondary text-muted-foreground'
                  } ${isToday ? 'ring-2 ring-primary' : ''}`}
                >
                  {claimed ? <Flame className="w-4 h-4" /> : `D${d}`}
                </div>
              )
            })}
          </div>
        </section>

        {/* Rewards roadmap */}
        <section className="bg-card border border-border rounded-2xl p-4 shadow-card space-y-3">
          <p className="text-eyebrow text-muted-foreground">Rewards</p>
          <RewardRow icon={<Sparkles className="w-4 h-4" />} day={3} label="Welcome bonus chip" unlocked={streak.current >= 3} />
          <RewardRow icon={<Trophy className="w-4 h-4" />} day={7} label="Free bet credit (operator-funded)" unlocked={streak.current >= 7} />
        </section>
      </main>

      <MobileNav selectedBets={[]} activeTab="me" />
    </div>
  )
}

function RewardRow({
  icon,
  day,
  label,
  unlocked,
}: {
  icon: React.ReactNode
  day: number
  label: string
  unlocked: boolean
}) {
  return (
    <div className={`flex items-center gap-3 p-2 -m-2 rounded-lg ${unlocked ? '' : 'opacity-70'}`}>
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          unlocked ? 'bg-success/15 text-success border border-success/30' : 'bg-secondary text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{label}</p>
        <p className="text-[11px] text-muted-foreground">Day {day}</p>
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
          unlocked
            ? 'text-success border-success/30 bg-success/10'
            : 'text-muted-foreground border-border bg-secondary'
        }`}
      >
        {unlocked ? 'Unlocked' : 'Locked'}
      </span>
    </div>
  )
}
