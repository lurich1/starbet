'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Ticket,
  History,
  Gift,
  Users,
  Flame,
  MessageCircle,
  HelpCircle,
  Settings,
  Loader2,
  X,
  Eye,
  EyeOff,
  Wallet,
  Banknote,
  TrendingUp,
  TrendingDown,
  Shield,
  LogOut,
  Copy,
  Check,
} from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BetSelection } from '@/lib/types'
import {
  clearUserSession,
  getUserId,
  getUserName,
} from '@/lib/user-session'

interface UserProfile {
  id: string
  name: string
  email?: string
  totalDeposited: number
  totalWithdrawn: number
  balance: number
  firstDepositAt?: string | null
}

const QUICK_LINKS = [
  { label: 'Bet History', icon: Ticket, href: '#' },
  { label: 'Transactions', icon: History, href: '#' },
  { label: 'Gifts', icon: Gift, href: '#', badge: '0' },
] as const

const MENU_ITEMS = [
  { label: 'My SportySocial', icon: Users, href: '#' },
  { label: 'Daily Streak', icon: Flame, href: '#', badge: '2' },
  { label: 'Customer Service', icon: MessageCircle, href: '#' },
  { label: 'How to Play', icon: HelpCircle, href: '#' },
  { label: 'Settings', icon: Settings, href: '#' },
] as const

export default function MePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [balanceHidden, setBalanceHidden] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selections, setSelections] = useState<BetSelection[]>([])

  const loadProfile = useCallback(async () => {
    const userId = getUserId()
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('not found')
      const data = (await res.json()) as UserProfile
      setProfile(data)
    } catch {
      const name = getUserName() ?? 'Player'
      setProfile({
        id: userId,
        name,
        totalDeposited: 0,
        totalWithdrawn: 0,
        balance: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    const onFocus = () => void loadProfile()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadProfile])

  const balance = profile?.balance ?? 0
  const depositHref = profile
    ? `/users/first-deposit?userId=${profile.id}`
    : '/register'

  const handleWithdraw = () => {
    setWithdrawMsg(null)
    setWithdrawError(null)
    setWithdrawAmount('')
    setWithdrawOpen(true)
  }

  const submitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    setWithdrawMsg(null)
    setWithdrawError(null)
    if (!profile) return
    const amt = Number(withdrawAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setWithdrawError('Enter a valid amount.')
      return
    }
    if (amt > balance) {
      setWithdrawError('Amount exceeds your balance.')
      return
    }
    setWithdrawLoading(true)
    try {
      const res = await fetch('/api/users/withdraw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, amount: amt }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              totalWithdrawn: data.user.totalWithdrawn,
              balance: data.user.balance,
            }
          : prev,
      )
      setWithdrawMsg(`Withdrew GHS ${amt.toFixed(2)} successfully.`)
      setWithdrawAmount('')
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : String(err))
    } finally {
      setWithdrawLoading(false)
    }
  }

  const copyUserId = async () => {
    if (!profile) return
    try {
      await navigator.clipboard.writeText(profile.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground pb-20">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-20">
        <div className="bg-gradient-to-br from-[#1c1512] to-[#2a2018] px-6 pt-12 pb-16 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#2ecc71]/20 border-2 border-[#2ecc71] flex items-center justify-center">
            <Wallet className="w-9 h-9 text-[#2ecc71]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Welcome to Prime Bet</h1>
          <p className="text-white/60 text-sm mb-6">
            Sign in to view your balance and wallet.
          </p>
          <div className="flex gap-3 max-w-sm mx-auto">
            <Link
              href="/login"
              className="flex-1 py-3 rounded-xl border-2 border-[#2ecc71] text-[#2ecc71] font-bold text-center hover:bg-[#2ecc71]/10 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="flex-1 py-3 rounded-xl bg-[#2ecc71] text-white font-bold text-center hover:bg-[#27ae60] transition-colors"
            >
              Register
            </Link>
          </div>
        </div>
        <MobileNav selectedBets={selections} activeTab="me" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-background flex flex-col pb-20 xl:pb-0 max-w-lg mx-auto w-full shadow-sm overflow-x-hidden">
      {/* Profile header — gradient hero */}
      <header className="bg-gradient-to-br from-[#1c1512] via-[#241a14] to-[#2a2018] text-white relative">
        <div className="px-3 sm:px-4 pt-5 pb-4 flex items-center gap-2.5 sm:gap-3">
          <div className="relative shrink-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#2ecc71] to-[#27ae60] flex items-center justify-center text-lg sm:text-xl font-bold text-white shadow-lg">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#2ecc71] border-2 border-[#1c1512]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-base sm:text-lg truncate">{profile.name}</p>
              <Shield className="w-4 h-4 text-[#2ecc71] shrink-0" />
            </div>
            <button
              type="button"
              onClick={copyUserId}
              className="flex items-center gap-1 text-[11px] sm:text-xs text-white/50 hover:text-white/80 transition-colors max-w-full"
            >
              <span className="font-mono truncate">ID: {profile.id.slice(0, 8)}…</span>
              {copied ? (
                <Check className="w-3 h-3 text-[#2ecc71] shrink-0" />
              ) : (
                <Copy className="w-3 h-3 shrink-0" />
              )}
            </button>
          </div>
          <Link
            href="/"
            className="text-xs text-[#2ecc71] font-semibold hover:underline shrink-0 px-2.5 sm:px-3 py-1.5 rounded-full border border-[#2ecc71]/40 hover:bg-[#2ecc71]/10 transition-colors"
          >
            Home
          </Link>
        </div>

        {/* Balance card */}
        <div className="px-3 sm:px-4 pb-5">
          <div className="rounded-2xl bg-black/30 border border-white/10 backdrop-blur p-3.5 sm:p-4">
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-[11px] uppercase tracking-wide text-white/50 font-semibold truncate">
                Total Balance
              </span>
              <button
                type="button"
                onClick={() => setBalanceHidden((v) => !v)}
                className="shrink-0 p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
              >
                {balanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums mb-4 truncate">
              {balanceHidden ? '••••••' : `GHS ${balance.toFixed(2)}`}
            </p>

            <div className="flex gap-2">
              <Link
                href={depositHref}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2ecc71] hover:bg-[#27ae60] text-white font-bold text-sm transition-colors shadow-sm min-w-0"
              >
                <Wallet className="w-4 h-4 shrink-0" strokeWidth={2.25} />
                <span className="truncate">Deposit</span>
              </Link>
              <button
                type="button"
                onClick={handleWithdraw}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#2ecc71] bg-transparent text-[#2ecc71] hover:bg-[#2ecc71]/10 font-bold text-sm transition-colors min-w-0"
              >
                <Banknote className="w-4 h-4 shrink-0" strokeWidth={2.25} />
                <span className="truncate">Withdraw</span>
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 sm:p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-white/50 text-[10px] uppercase tracking-wide font-semibold">
                <TrendingUp className="w-3 h-3 text-[#2ecc71] shrink-0" />
                <span className="truncate">Deposited</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-white tabular-nums mt-1 truncate">
                {balanceHidden ? '••••' : `GHS ${profile.totalDeposited.toFixed(2)}`}
              </p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 sm:p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-white/50 text-[10px] uppercase tracking-wide font-semibold">
                <TrendingDown className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">Withdrawn</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-white tabular-nums mt-1 truncate">
                {balanceHidden ? '••••' : `GHS ${profile.totalWithdrawn.toFixed(2)}`}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Quick links */}
      <section className="-mt-3 mx-2.5 sm:mx-3 mb-3 relative z-10">
        <div className="grid grid-cols-3 bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          {QUICK_LINKS.map((item, i) => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center gap-1.5 py-3.5 px-1.5 sm:px-2 hover:bg-secondary/40 transition-colors min-w-0 ${
                  i > 0 ? 'border-l border-border' : ''
                }`}
              >
                <Icon className="w-5 h-5 text-[#2ecc71] shrink-0" />
                <span className="text-[10px] sm:text-[11px] text-center leading-tight font-medium text-foreground line-clamp-2">
                  {item.label}
                  {'badge' in item && item.badge ? ` (${item.badge})` : ''}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Menu list */}
      <main className="flex-1 px-2.5 sm:px-3">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <ul className="divide-y divide-border">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {'badge' in item && item.badge && (
                      <span className="min-w-[22px] h-[22px] rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-4 mb-6">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              clearUserSession()
              router.push('/login')
            }}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </main>

      <MobileNav
        selectedBets={selections}
        onRemoveSelection={(id) =>
          setSelections((prev) => prev.filter((s) => s.id !== id))
        }
        onClearAll={() => setSelections([])}
        activeTab="me"
      />

      {/* Withdraw sheet */}
      {withdrawOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setWithdrawOpen(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Withdraw</h2>
              <button
                type="button"
                onClick={() => setWithdrawOpen(false)}
                className="p-1 rounded-md hover:bg-secondary"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-secondary/60 border border-border">
              <div className="w-10 h-10 rounded-full bg-[#2ecc71]/20 border-2 border-[#2ecc71] flex items-center justify-center text-sm font-bold text-[#2ecc71] shrink-0">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">{profile.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  ID: {profile.id.slice(0, 8)}…
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Available
                </p>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  GHS {balance.toFixed(2)}
                </p>
              </div>
            </div>

            <form onSubmit={submitWithdraw} className="space-y-4">
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                max={balance || undefined}
                placeholder="Amount"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="h-12 text-lg font-bold tabular-nums"
                disabled={withdrawLoading}
                required
              />
              {withdrawError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  {withdrawError}
                </p>
              )}
              {withdrawMsg && !withdrawError && (
                <p className="text-xs text-success bg-success/10 border border-success/20 rounded-lg p-3">
                  {withdrawMsg}
                </p>
              )}
              <Button
                type="submit"
                disabled={withdrawLoading || balance <= 0}
                className="w-full h-11 border-2 border-[#2ecc71] bg-transparent text-[#2ecc71] hover:bg-[#2ecc71]/10 font-bold"
              >
                {withdrawLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…
                  </>
                ) : (
                  'Withdraw'
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
