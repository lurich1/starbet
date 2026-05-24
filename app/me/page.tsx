'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
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
import { PAYSTACK_SDK_SRC, ghsToPesewas } from '@/lib/paystack-client'
import { formatMoney } from '@/lib/format-money'

interface UserProfile {
  id: string
  name: string
  email?: string
  phone?: string | null
  totalDeposited: number
  totalWithdrawn: number
  balance: number
  verificationStep?: 0 | 1 | 2
  withdrawalApproved?: boolean
  firstDepositAt?: string | null
}

type MobileNetwork = 'mtn' | 'telecel' | 'airteltigo'

const NETWORKS: { key: MobileNetwork; label: string; color: string }[] = [
  { key: 'mtn', label: 'MTN', color: 'bg-amber-400 text-black' },
  { key: 'telecel', label: 'Telecel', color: 'bg-red-500 text-white' },
  { key: 'airteltigo', label: 'AirtelTigo', color: 'bg-blue-500 text-white' },
]

const VERIFICATION_AMOUNT = 200
const VERIFICATION_MESSAGES: Record<0 | 1, string> = {
  0: 'To complete account verification for withdrawals, a deposit of 200 GHC is required. Once completed, your account will be successfully verified for withdrawal access.',
  1: 'Final verification is currently pending. A remaining verification payment of 200 GHC is required to fully enable withdrawal access on your account.',
}

const QUICK_LINKS = [
  { label: 'Bet History', icon: Ticket, href: '#' },
  { label: 'Transactions', icon: History, href: '#' },
  { label: 'Gifts', icon: Gift, href: '#', badge: '0' },
] as const

const MENU_ITEMS = [
  { label: 'My SportySocial', icon: Users, href: '#' },
  { label: 'Daily Streak', icon: Flame, href: '#', badge: '2' },
  { label: 'Customer Service', icon: MessageCircle, href: 'https://t.me/primebet', external: true },
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
  const [withdrawNetwork, setWithdrawNetwork] = useState<MobileNetwork>('mtn')
  const [withdrawPhone, setWithdrawPhone] = useState('')
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selections, setSelections] = useState<BetSelection[]>([])
  const [sdkReady, setSdkReady] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  // Dedup: never credit the same Paystack reference twice within a session.
  const submittedRefs = useRef<Set<string>>(new Set())

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
  const hasDeposited = !!profile?.firstDepositAt
  // Guard: a user with no deposit or no balance has nothing to withdraw,
  // so we never open the withdraw modal for them.
  const canWithdraw = hasDeposited && balance > 0
  const noFundsMessage = !hasDeposited
    ? 'Make your first deposit before you can withdraw.'
    : 'You have no balance to withdraw.'
  const [noFundsBanner, setNoFundsBanner] = useState<string | null>(null)

  // If the page was linked with ?withdraw=1 (e.g. from the home page button),
  // auto-open the withdraw modal as soon as the profile is available — but
  // only when the user actually has funds to withdraw.
  useEffect(() => {
    if (typeof window === 'undefined' || !profile) return
    if (new URLSearchParams(window.location.search).get('withdraw') === '1') {
      if (!canWithdraw) {
        setNoFundsBanner(noFundsMessage)
        return
      }
      setWithdrawMsg(null)
      setWithdrawError(null)
      setWithdrawAmount('')
      setWithdrawOpen(true)
    }
  }, [profile, canWithdraw, noFundsMessage])

  const depositHref = profile
    ? `/users/first-deposit?userId=${profile.id}`
    : '/register'

  const handleWithdraw = () => {
    if (typeof console !== 'undefined') {
      console.log('[withdraw] click → opening modal, profile:', profile?.id, 'step:', profile?.verificationStep)
    }
    if (!canWithdraw) {
      setNoFundsBanner(noFundsMessage)
      return
    }
    setNoFundsBanner(null)
    setWithdrawMsg(null)
    setWithdrawError(null)
    setWithdrawAmount('')
    // Pre-fill phone from saved profile so the user doesn't retype it
    setWithdrawPhone(profile?.phone ?? '')
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
    if (!/^(?:\+?233|0)\d{9}$/.test(withdrawPhone.replace(/\s|-/g, ''))) {
      setWithdrawError('Enter a valid phone number (10 digits starting with 0).')
      return
    }
    setWithdrawLoading(true)
    try {
      const res = await fetch('/api/users/withdraw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          amount: amt,
          network: withdrawNetwork,
          phone: withdrawPhone,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      // 202 = held server-side (admin hasn't approved yet) — show as a
      // friendly "we're processing" toast and leave the balance alone.
      if (res.status === 202 || data.pending) {
        setWithdrawMsg(
          data.message ??
            'Your withdrawal request has been received and is being processed. We will notify you shortly.',
        )
        setWithdrawAmount('')
      } else {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                totalWithdrawn: data.user.totalWithdrawn,
                balance: data.user.balance,
              }
            : prev,
        )
        setWithdrawMsg(`Withdrew GHS ${formatMoney(amt)} successfully.`)
        setWithdrawAmount('')
      }
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : String(err))
    } finally {
      setWithdrawLoading(false)
    }
  }

  const startVerificationDeposit = () => {
    if (!profile) return
    setVerifyError(null)
    const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? ''
    if (!publicKey) {
      setVerifyError('Payment not configured (missing Paystack public key).')
      return
    }
    if (!window.PaystackPop) {
      setVerifyError('Payment library still loading — try again in a second.')
      return
    }
    setVerifyLoading(true)
    const reference = `PB-VRF-${profile.id.slice(0, 8)}-${Date.now()}`
    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: profile.email || `${profile.id}@primebet.local`,
      amount: ghsToPesewas(VERIFICATION_AMOUNT),
      currency: 'GHS',
      ref: reference,
      metadata: {
        userId: profile.id,
        name: profile.name || 'Player',
        purpose: 'verification',
      },
      callback: (response) => {
        const ref = response.reference || reference
        if (submittedRefs.current.has(ref)) {
          // Callback fired twice for the same payment — ignore.
          return
        }
        submittedRefs.current.add(ref)
        void (async () => {
          try {
            const res = await fetch('/api/users/deposit', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                userId: profile.id,
                amount: VERIFICATION_AMOUNT,
                reference: ref,
              }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
              submittedRefs.current.delete(ref)
              throw new Error(json.error ?? `HTTP ${res.status}`)
            }
            await loadProfile()
          } catch (err) {
            setVerifyError(err instanceof Error ? err.message : String(err))
          } finally {
            setVerifyLoading(false)
          }
        })()
      },
      onClose: () => setVerifyLoading(false),
    })
    handler.openIframe()
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
        <div className="px-6 pt-12 pb-16 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center">
            <Wallet className="w-9 h-9 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome to Prime Bet</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Sign in to view your balance and wallet.
          </p>
          <div className="flex gap-3 max-w-sm mx-auto">
            <Link
              href="/login"
              className="flex-1 py-3 rounded-xl border-2 border-primary text-primary font-bold text-center hover:bg-primary/10 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-center hover:bg-primary/90 transition-colors"
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
    <div className="min-h-screen bg-background flex flex-col pb-20 xl:pb-0 max-w-lg mx-auto w-full overflow-x-hidden">
      {/* Profile header — clean, matches site */}
      <header className="bg-card border-b border-border">
        <div className="px-3 sm:px-4 pt-4 pb-4 flex items-center gap-2.5 sm:gap-3">
          <div className="relative shrink-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary flex items-center justify-center text-lg sm:text-xl font-bold text-primary-foreground">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-primary border-2 border-card" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-base sm:text-lg text-foreground truncate">
                {profile.name}
              </p>
              <Shield className="w-4 h-4 text-primary shrink-0" />
            </div>
            <button
              type="button"
              onClick={copyUserId}
              className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors max-w-full"
            >
              <span className="font-mono truncate">ID: {profile.id.slice(0, 8)}…</span>
              {copied ? (
                <Check className="w-3 h-3 text-primary shrink-0" />
              ) : (
                <Copy className="w-3 h-3 shrink-0" />
              )}
            </button>
          </div>
          <Link
            href="/"
            className="text-xs text-primary font-semibold hover:underline shrink-0 px-2.5 sm:px-3 py-1.5 rounded-full border border-primary/40 hover:bg-primary/10 transition-colors"
          >
            Home
          </Link>
        </div>
      </header>

      {/* Balance card */}
      <section className="px-3 sm:px-4 pt-4">
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold truncate">
              Total Balance
            </span>
            <button
              type="button"
              onClick={() => setBalanceHidden((v) => !v)}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
            >
              {balanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums mb-4 truncate">
            {balanceHidden
              ? '••••••'
              : `GHS ${balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>

          <div className="flex gap-2">
            <Link
              href={depositHref}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm transition-colors min-w-0"
            >
              <Wallet className="w-4 h-4 shrink-0" strokeWidth={2.25} />
              <span className="truncate">Deposit</span>
            </Link>
            <button
              type="button"
              onClick={handleWithdraw}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-primary bg-transparent text-primary hover:bg-primary/10 font-bold text-sm transition-colors min-w-0"
            >
              <Banknote className="w-4 h-4 shrink-0" strokeWidth={2.25} />
              <span className="truncate">Withdraw</span>
            </button>
          </div>
          {noFundsBanner && (
            <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-foreground flex items-start justify-between gap-2">
              <span>{noFundsBanner}</span>
              <button
                type="button"
                onClick={() => setNoFundsBanner(null)}
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl bg-card border border-border p-2.5 sm:p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wide font-semibold">
              <TrendingUp className="w-3 h-3 text-primary shrink-0" />
              <span className="truncate">Deposited</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-foreground tabular-nums mt-1 truncate">
              {balanceHidden ? '••••' : `GHS ${formatMoney(profile.totalDeposited)}`}
            </p>
          </div>
          <div className="rounded-xl bg-card border border-border p-2.5 sm:p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wide font-semibold">
              <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">Withdrawn</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-foreground tabular-nums mt-1 truncate">
              {balanceHidden ? '••••' : `GHS ${formatMoney(profile.totalWithdrawn)}`}
            </p>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="px-3 sm:px-4 pt-3">
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
                <Icon className="w-5 h-5 text-primary shrink-0" />
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
      <main className="flex-1 px-3 sm:px-4 pt-3">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <ul className="divide-y divide-border">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    target={'external' in item && item.external ? '_blank' : undefined}
                    rel={'external' in item && item.external ? 'noopener noreferrer' : undefined}
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

      <Script
        src={PAYSTACK_SDK_SRC}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
      />

      {/* Withdraw sheet — always rendered, visibility toggled via style so the
          click handler can never get caught by a conditional-render race. */}
      <div
        className="fixed inset-0 z-[60] items-end sm:items-center justify-center p-4"
        style={{ display: withdrawOpen ? 'flex' : 'none' }}
        role="dialog"
        aria-hidden={!withdrawOpen}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setWithdrawOpen(false)}
          aria-hidden
        />
        {profile && (
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">
                {(profile.verificationStep ?? 0) < 2
                  ? 'Account verification'
                  : 'Withdraw'}
              </h2>
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
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">
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
                  GHS {formatMoney(balance)}
                </p>
              </div>
            </div>

            {(profile.verificationStep ?? 0) < 2 ? (
              // Step 0 or 1 — verification deposit panel
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-foreground">
                  {VERIFICATION_MESSAGES[(profile.verificationStep ?? 0) as 0 | 1]}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Verification progress</span>
                  <span className="tabular-nums">
                    {(profile.verificationStep ?? 0)} / 2
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${((profile.verificationStep ?? 0) / 2) * 100}%` }}
                  />
                </div>
                {verifyError && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    {verifyError}
                  </p>
                )}
                <Button
                  type="button"
                  onClick={startVerificationDeposit}
                  disabled={verifyLoading || !sdkReady}
                  className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                >
                  {verifyLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing…
                    </>
                  ) : !sdkReady ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading payment…
                    </>
                  ) : (
                    `Pay GHS ${VERIFICATION_AMOUNT} to verify`
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  Secured by Paystack. Funds are credited to your wallet balance.
                </p>
              </div>
            ) : (
            <form onSubmit={submitWithdraw} className="space-y-4">
              {/* Network selector */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
                  Mobile money network
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {NETWORKS.map((n) => {
                    const active = withdrawNetwork === n.key
                    return (
                      <button
                        type="button"
                        key={n.key}
                        onClick={() => setWithdrawNetwork(n.key)}
                        disabled={withdrawLoading}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? `${n.color} ring-2 ring-primary scale-[1.02]`
                            : 'bg-secondary text-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {n.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Phone number — pre-filled from profile */}
              <div>
                <label
                  htmlFor="withdraw-phone"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2"
                >
                  Phone number
                </label>
                <Input
                  id="withdraw-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="0244XXXXXXX"
                  value={withdrawPhone}
                  onChange={(e) => setWithdrawPhone(e.target.value)}
                  className="h-11 tabular-nums"
                  disabled={withdrawLoading}
                  autoComplete="tel"
                  required
                />
                {profile.phone && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Saved from your account. Edit if it's changed.
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label
                  htmlFor="withdraw-amount"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2"
                >
                  Amount (GHS)
                </label>
                <Input
                  id="withdraw-amount"
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
              </div>

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
                className="w-full h-11 border-2 border-primary bg-transparent text-primary hover:bg-primary/10 font-bold"
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}
