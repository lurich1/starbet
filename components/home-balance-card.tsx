'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Eye, EyeOff, Wallet, Banknote, ArrowRight } from 'lucide-react'
import { getUserId, getUserName } from '@/lib/user-session'

interface UserProfile {
  id: string
  name: string
  balance: number
  totalDeposited: number
  totalWithdrawn: number
}

export function HomeBalanceCard() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hidden, setHidden] = useState(false)

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

  if (!userId) {
    return (
      <section className="mb-4 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1c1512] to-[#2a2018] border border-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-white/60">Welcome to Prime Bet</p>
          <p className="text-base sm:text-lg font-bold text-white mt-0.5">
            Sign in to see your balance and place bets.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/login"
            className="flex-1 sm:flex-none text-center px-4 py-2 rounded-lg border-2 border-[#2ecc71] text-[#2ecc71] text-sm font-bold hover:bg-[#2ecc71]/10 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="flex-1 sm:flex-none text-center px-4 py-2 rounded-lg bg-[#2ecc71] text-white text-sm font-bold hover:bg-[#27ae60] transition-colors"
          >
            Register
          </Link>
        </div>
      </section>
    )
  }

  const balance = profile?.balance ?? 0
  const depositHref = `/users/first-deposit?userId=${userId}`

  return (
    <section className="mb-4 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1c1512] to-[#2a2018] border border-border">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-white/50">Total Balance</p>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums truncate">
                {hidden ? '••••••' : `GHS ${balance.toFixed(2)}`}
              </p>
              <button
                type="button"
                onClick={() => setHidden((v) => !v)}
                className="shrink-0 p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={hidden ? 'Show balance' : 'Hide balance'}
              >
                {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-white/50 mt-1 truncate">
              Hi, <span className="text-white/80 font-medium">{profile?.name ?? 'Player'}</span>
            </p>
          </div>
          <Link
            href="/me"
            className="hidden sm:flex items-center gap-1 text-xs text-[#2ecc71] hover:underline shrink-0"
          >
            Account <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="flex gap-2 sm:gap-3">
          <Link
            href={depositHref}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2ecc71] hover:bg-[#27ae60] text-white font-bold text-sm transition-colors min-w-0"
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span className="truncate">Deposit</span>
          </Link>
          <Link
            href="/me"
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#2ecc71] bg-transparent text-[#2ecc71] hover:bg-[#2ecc71]/10 font-bold text-sm transition-colors min-w-0"
          >
            <Banknote className="w-4 h-4 shrink-0" />
            <span className="truncate">Withdraw</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
