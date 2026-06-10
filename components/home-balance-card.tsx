'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Banknote, Eye, EyeOff, Wallet } from 'lucide-react'
import { getUserId, getUserName } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'

interface UserProfile {
  id: string
  name: string
  balance: number
  totalDeposited: number
  totalWithdrawn: number
  currency?: string
}

export function HomeBalanceCard() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hidden, setHidden] = useState(false)
  // Flash the balance when it changes so deposits/wins feel acknowledged.
  const [flashKey, setFlashKey] = useState(0)
  const prevBalance = useRef<number | null>(null)

  useEffect(() => {
    setUserId(getUserId())
  }, [])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) {
            setProfile({
              id: userId,
              name: getUserName() ?? 'Player',
              balance: 0,
              totalDeposited: 0,
              totalWithdrawn: 0,
            })
          }
          return
        }
        const data = (await res.json()) as UserProfile
        if (!cancelled) setProfile(data)
      } catch {
        /* ignore */
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [userId])

  // Trigger the value-flash class whenever the balance increases.
  useEffect(() => {
    if (!profile) return
    if (prevBalance.current !== null && profile.balance > prevBalance.current) {
      setFlashKey((k) => k + 1)
    }
    prevBalance.current = profile.balance
  }, [profile])

  if (!userId) {
    return (
      <section className="mb-4 rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-card lift-on-hover">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-eyebrow text-muted-foreground">Welcome to Prime Bet</p>
              <p className="text-base sm:text-lg font-bold mt-0.5">
                Sign in to start winning
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/login"
              className="flex-1 sm:flex-none text-center px-4 h-10 inline-flex items-center justify-center rounded-lg border-2 border-primary text-primary text-sm font-bold hover:bg-primary/10 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="flex-1 sm:flex-none text-center px-4 h-10 inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-card"
            >
              Register
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const balance = profile?.balance ?? 0
  const currency = profile?.currency ?? 'GHS'
  const depositHref = `/users/first-deposit?userId=${userId}`

  return (
    <section className="relative mb-4 rounded-2xl border border-primary/30 shadow-lg shadow-primary/20 overflow-hidden text-white bg-gradient-to-br from-primary via-[#6d28d9] to-[#3b1378]">
      {/* Decorative glow blobs */}
      <div aria-hidden className="absolute -right-12 -top-14 w-52 h-52 rounded-full bg-white/15 blur-3xl" />
      <div aria-hidden className="absolute -left-16 -bottom-16 w-52 h-52 rounded-full bg-fuchsia-400/20 blur-3xl" />
      {/* Subtle dot texture */}
      <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-eyebrow text-white/70">Total Balance</p>
              <button
                type="button"
                onClick={() => setHidden((v) => !v)}
                className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={hidden ? 'Show balance' : 'Hide balance'}
              >
                {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-bold text-white/70 tabular-nums">
                {currency}
              </span>
              <span
                key={flashKey}
                className="text-display font-black tabular-nums truncate rounded-md px-1 -mx-1 animate-value-flash drop-shadow"
              >
                {hidden ? '••••••' : formatMoney(balance, currency)}
              </span>
            </div>
            <p className="text-xs text-white/70 mt-1.5 truncate">
              Hi, <span className="text-white font-semibold">{profile?.name ?? 'Player'}</span>
            </p>
          </div>
          <Link
            href="/me"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-white/90 hover:text-white shrink-0"
          >
            Account <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Link
            href={depositHref}
            className="group/btn relative inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-white text-primary font-bold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            <Wallet className="w-4 h-4 transition-transform group-hover/btn:scale-110" />
            Deposit
          </Link>
          <Link
            href="/me?withdraw=1"
            className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-white/40 text-white font-bold text-sm hover:bg-white/10 transition-colors"
          >
            <Banknote className="w-4 h-4" />
            Withdraw
          </Link>
        </div>
      </div>
    </section>
  )
}
