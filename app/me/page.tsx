'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronRight,
  Ticket,
  History,
  Gift,
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
import { formatMoney } from '@/lib/format-money'
import { SUPPORT_TELEGRAM_URL } from '@/lib/support'
import {
  DEFAULT_COUNTRY,
  DEFAULT_CURRENCY,
  getCountry,
  getVerificationAmount,
  isCountryCode,
  isCurrencyCode,
  normalizePhone,
  type CountryCode,
  type CurrencyCode,
} from '@/lib/countries'
import { openPaystackPopup } from '@/lib/paystack-inline'
import { MobileMoneyForm } from '@/components/payments/mobile-money-form'

interface UserProfile {
  id: string
  name: string
  email?: string
  phone?: string | null
  country?: string
  currency?: string
  totalDeposited: number
  totalWithdrawn: number
  balance: number
  verificationStep?: 0 | 1 | 2 | 3 | 4
  withdrawalApproved?: boolean
  firstDepositAt?: string | null
}

const NETWORK_STYLE: Record<string, string> = {
  mtn: 'bg-amber-400 text-black',
  telecel: 'bg-red-500 text-white',
  airteltigo: 'bg-blue-500 text-white',
  mpesa: 'bg-green-600 text-white',
  airtel: 'bg-red-600 text-white',
  bank: 'bg-slate-600 text-white',
}

const QUICK_LINKS = [
  { label: 'Bet History', icon: Ticket, href: '/me/bets' },
  { label: 'Transactions', icon: History, href: '/me/transactions' },
  { label: 'Gifts', icon: Gift, href: '/me/gifts', badge: '0' },
] as const

const MENU_ITEMS = [
  { label: 'Daily Streak', icon: Flame, href: '/me/streak', badge: '2' },
  { label: 'Customer Service', icon: MessageCircle, href: SUPPORT_TELEGRAM_URL, external: true },
  { label: 'How to Play', icon: HelpCircle, href: '/me/how-to-play' },
  { label: 'Settings', icon: Settings, href: '/me/settings' },
] as const

export default function MePage() {
  // useSearchParams() needs to live inside a Suspense boundary or
  // `next build` errors out trying to statically prerender the route.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <MePageInner />
    </Suspense>
  )
}

function MePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [balanceHidden, setBalanceHidden] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawNetwork, setWithdrawNetwork] = useState<string>('mtn')
  const [withdrawPhone, setWithdrawPhone] = useState('')
  const [withdrawAccount, setWithdrawAccount] = useState('')
  const [withdrawBank, setWithdrawBank] = useState('')
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selections, setSelections] = useState<BetSelection[]>([])
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [depositToast, setDepositToast] = useState<{ kind: 'success' | 'failed'; text: string } | null>(null)

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

  // Handle the redirect back from Moolre / Paystack. On success we re-fetch
  // the profile so the new balance / verification step are reflected; on
  // failure we surface the reason as a dismissible toast. Strip the query
  // params after handling so a refresh doesn't replay them.
  useEffect(() => {
    const moolre = searchParams.get('moolre')
    const paystack = searchParams.get('paystack')
    if (!moolre && !paystack) return
    const success =
      moolre === 'success' || paystack === 'success' || paystack === 'already-credited'
    if (success) {
      setDepositToast({ kind: 'success', text: 'Deposit credited. Welcome back!' })
      void loadProfile()
    } else {
      const reason = searchParams.get('reason') ?? paystack ?? moolre
      setDepositToast({
        kind: 'failed',
        text: reason ? `Deposit failed: ${reason}` : 'Deposit failed. Try again.',
      })
    }
    router.replace('/me')
  }, [searchParams, loadProfile, router])

  // Country / currency derived from the loaded profile, with safe defaults.
  const country: CountryCode = isCountryCode(profile?.country) ? (profile!.country as CountryCode) : DEFAULT_COUNTRY
  const currency: CurrencyCode = isCurrencyCode(profile?.currency) ? (profile!.currency as CurrencyCode) : DEFAULT_CURRENCY
  const countryCfg = getCountry(country)
  const verificationAmount = getVerificationAmount(country)
  const VERIFICATION_TOTAL = 4
  function verificationMessageFor(step: number): string {
    const remaining = Math.max(0, VERIFICATION_TOTAL - step)
    return `Account verification in progress (${step}/${VERIFICATION_TOTAL}). ${remaining} more qualifying deposit${remaining === 1 ? '' : 's'} of ${currency} ${verificationAmount} required before withdrawal options unlock.`
  }

  // Default the network to the first one the country supports.
  useEffect(() => {
    if (countryCfg.payoutNetworks.length > 0) {
      setWithdrawNetwork((curr) =>
        countryCfg.payoutNetworks.some((n) => n.key === curr)
          ? curr
          : countryCfg.payoutNetworks[0].key,
      )
    }
  }, [countryCfg])

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
    let payoutBody: Record<string, unknown>
    if (countryCfg.payoutTarget === 'mobile') {
      if (!normalizePhone(country, withdrawPhone)) {
        setWithdrawError(`Enter a valid ${countryCfg.name} phone number.`)
        return
      }
      payoutBody = { phone: withdrawPhone, network: withdrawNetwork }
    } else {
      if (!/^\d{6,20}$/.test(withdrawAccount.replace(/\s|-/g, ''))) {
        setWithdrawError('Enter a valid bank account number (digits only).')
        return
      }
      if (!withdrawBank.trim()) {
        setWithdrawError('Enter the bank name.')
        return
      }
      payoutBody = {
        accountNumber: withdrawAccount,
        bankName: withdrawBank,
        network: withdrawNetwork,
      }
    }
    setWithdrawLoading(true)
    try {
      const res = await fetch('/api/users/withdraw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          amount: amt,
          ...payoutBody,
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
        setWithdrawMsg(`Withdrew ${currency} ${formatMoney(amt, currency)} successfully.`)
        setWithdrawAmount('')
      }
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : String(err))
    } finally {
      setWithdrawLoading(false)
    }
  }

  const startVerificationDeposit = async () => {
    if (!profile) return
    setVerifyError(null)
    // Manual gateway has no hosted checkout — send the user to the deposit
    // page with purpose=verification and let them upload a screenshot there.
    if (countryCfg.gateway === 'manual') {
      router.push(
        `/users/first-deposit?userId=${profile.id}&purpose=verification`,
      )
      return
    }
    setVerifyLoading(true)
    try {
      const endpoint = countryCfg.gateway === 'moolre'
        ? '/api/payments/moolre/start'
        : '/api/payments/paystack/start'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          amount: verificationAmount,
          purpose: 'verification',
          returnPath: '/me',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      if (countryCfg.gateway === 'paystack') {
        if (!data.publicKey) {
          throw new Error('Paystack public key not configured on server')
        }
        await openPaystackPopup({
          publicKey: data.publicKey,
          email: data.email,
          amountMinor: data.amountMinor,
          reference: data.reference,
          currency: data.currency,
          metadata: { userId: profile.id, purpose: 'verification' },
          onSuccess: async (reference) => {
            try {
              const vres = await fetch('/api/payments/paystack/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ reference }),
              })
              const vdata = await vres.json().catch(() => ({}))
              if (!vres.ok || !vdata.ok) {
                setDepositToast({
                  kind: 'failed',
                  text: `Verification deposit failed (${vdata.status ?? vres.status}). Try again.`,
                })
              } else {
                setDepositToast({ kind: 'success', text: 'Deposit credited. Welcome back!' })
                await loadProfile()
              }
            } catch (err) {
              setVerifyError(err instanceof Error ? err.message : String(err))
            } finally {
              setVerifyLoading(false)
            }
          },
          onClose: () => {
            setVerifyLoading(false)
          },
        })
        return
      }

      if (!data.url) throw new Error('gateway did not return a redirect URL')
      window.location.href = data.url as string
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err))
      setVerifyLoading(false)
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
        <div className="px-6 pt-12 pb-16 text-center max-w-sm mx-auto">
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div aria-hidden className="absolute inset-0 rounded-full bg-primary/15 blur-xl" />
            <div className="relative w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-card">
              <Wallet className="w-9 h-9 text-primary" />
            </div>
          </div>
          <h1 className="text-title font-bold text-foreground mb-1.5">Welcome to Prime Bet</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Sign in to view your balance and wallet.
          </p>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="flex-1 h-12 inline-flex items-center justify-center rounded-xl border-2 border-primary text-primary font-bold hover:bg-primary/10 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="flex-1 h-12 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-card hover:shadow-card-hover hover:-translate-y-0.5"
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
        <div className="relative rounded-2xl bg-gradient-to-br from-card via-card to-secondary/30 border border-border shadow-card overflow-hidden">
          <div aria-hidden className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative p-4 sm:p-5">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-eyebrow text-muted-foreground truncate">
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
            <div className="flex items-baseline gap-2 mb-4 min-w-0">
              <span className="text-sm font-bold text-muted-foreground tabular-nums shrink-0">
                {currency}
              </span>
              <span className="text-display font-black text-foreground tabular-nums truncate rounded-md px-1 -mx-1">
                {balanceHidden ? '••••••' : formatMoney(balance, currency)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Link
                href={depositHref}
                className="group/btn inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0 transition-all min-w-0"
              >
                <Wallet className="w-4 h-4 shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.25} />
                <span className="truncate">Deposit</span>
              </Link>
              <button
                type="button"
                onClick={handleWithdraw}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-primary bg-transparent text-primary hover:bg-primary/10 font-bold text-sm transition-colors min-w-0"
              >
                <Banknote className="w-4 h-4 shrink-0" strokeWidth={2.25} />
                <span className="truncate">Withdraw</span>
              </button>
            </div>
            {depositToast && (
              <div
                className={`mt-3 p-2.5 rounded-lg text-xs flex items-start justify-between gap-2 border ${
                  depositToast.kind === 'success'
                    ? 'bg-success/10 border-success/30 text-foreground'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                <span>{depositToast.text}</span>
                <button
                  type="button"
                  onClick={() => setDepositToast(null)}
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <div className="rounded-xl bg-card border border-border p-3 min-w-0 shadow-card lift-on-hover">
            <div className="flex items-center gap-1.5 text-muted-foreground text-eyebrow">
              <TrendingUp className="w-3 h-3 text-primary shrink-0" />
              <span className="truncate">Deposited</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-foreground tabular-nums mt-1.5 truncate">
              {balanceHidden ? '••••' : `${currency} ${formatMoney(profile.totalDeposited, currency)}`}
            </p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3 min-w-0 shadow-card lift-on-hover">
            <div className="flex items-center gap-1.5 text-muted-foreground text-eyebrow">
              <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">Withdrawn</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-foreground tabular-nums mt-1.5 truncate">
              {balanceHidden ? '••••' : `${currency} ${formatMoney(profile.totalWithdrawn, currency)}`}
            </p>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="px-3 sm:px-4 pt-3">
        <div className="grid grid-cols-3 bg-card border border-border rounded-2xl shadow-card overflow-hidden">
          {QUICK_LINKS.map((item, i) => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group/quick flex flex-col items-center gap-1.5 py-4 px-1.5 sm:px-2 hover:bg-primary/5 transition-colors min-w-0 ${
                  i > 0 ? 'border-l border-border' : ''
                }`}
              >
                <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover/quick:bg-primary/15 transition-colors">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                </span>
                <span className="text-[10px] sm:text-[11px] text-center leading-tight font-semibold text-foreground line-clamp-2">
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-card">
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
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-popover animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">
                {(profile.verificationStep ?? 0) < VERIFICATION_TOTAL
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
                  {currency} {formatMoney(balance, currency)}
                </p>
              </div>
            </div>

            {(profile.verificationStep ?? 0) < VERIFICATION_TOTAL ? (
              // Step 0 or 1 — verification deposit panel
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-foreground">
                  {verificationMessageFor(profile.verificationStep ?? 0)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Verification progress</span>
                  <span className="tabular-nums">
                    {(profile.verificationStep ?? 0)} / {VERIFICATION_TOTAL}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${((profile.verificationStep ?? 0) / VERIFICATION_TOTAL) * 100}%` }}
                  />
                </div>
                {verifyError && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    {verifyError}
                  </p>
                )}
                {countryCfg.gateway === 'paystack' && country === 'GH' ? (
                  <MobileMoneyForm
                    userId={profile.id}
                    amount={verificationAmount}
                    currency={currency}
                    defaultPhone={profile.phone ?? null}
                    purpose="verification"
                    onSuccess={async () => {
                      setDepositToast({ kind: 'success', text: 'Deposit credited. Welcome back!' })
                      await loadProfile()
                    }}
                    onSwitchToCard={() => void startVerificationDeposit()}
                  />
                ) : (
                  <>
                    <Button
                      type="button"
                      onClick={() => void startVerificationDeposit()}
                      disabled={verifyLoading}
                      className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                    >
                      {verifyLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {countryCfg.gateway === 'manual'
                            ? 'Opening…'
                            : countryCfg.gateway === 'paystack'
                              ? 'Opening checkout…'
                              : 'Redirecting…'}
                        </>
                      ) : countryCfg.gateway === 'manual' ? (
                        `Pay ${currency} ${verificationAmount} via bank transfer`
                      ) : (
                        `Pay ${currency} ${verificationAmount} to verify`
                      )}
                    </Button>
                    <p className="text-[11px] text-center text-muted-foreground">
                      {countryCfg.gateway === 'manual'
                        ? 'Bank transfer · Admin credits your wallet after verifying the screenshot.'
                        : `Secured by ${countryCfg.gateway === 'moolre' ? 'Moolre' : 'Paystack'}. Funds are credited to your wallet balance.`}
                    </p>
                  </>
                )}
              </div>
            ) : (
            <form onSubmit={submitWithdraw} className="space-y-4">
              {/* Payout option selector (mobile money networks for GH/KE; bank for NG/ZA) */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
                  {countryCfg.payoutTarget === 'mobile' ? 'Mobile money network' : 'Payout option'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {countryCfg.payoutNetworks.map((n) => {
                    const active = withdrawNetwork === n.key
                    const style = NETWORK_STYLE[n.key] ?? 'bg-slate-600 text-white'
                    return (
                      <button
                        type="button"
                        key={n.key}
                        onClick={() => setWithdrawNetwork(n.key)}
                        disabled={withdrawLoading}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                          active
                            ? `${style} ring-2 ring-primary scale-[1.02]`
                            : 'bg-secondary text-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {n.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {countryCfg.payoutTarget === 'mobile' ? (
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
                    placeholder={`+${countryCfg.dialCode} …`}
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
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="withdraw-bank"
                      className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2"
                    >
                      Bank name
                    </label>
                    <Input
                      id="withdraw-bank"
                      type="text"
                      placeholder="e.g. Access Bank"
                      value={withdrawBank}
                      onChange={(e) => setWithdrawBank(e.target.value)}
                      className="h-11"
                      disabled={withdrawLoading}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="withdraw-account"
                      className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2"
                    >
                      Account number
                    </label>
                    <Input
                      id="withdraw-account"
                      type="text"
                      inputMode="numeric"
                      placeholder="Account number"
                      value={withdrawAccount}
                      onChange={(e) => setWithdrawAccount(e.target.value)}
                      className="h-11 tabular-nums"
                      disabled={withdrawLoading}
                      required
                    />
                  </div>
                </>
              )}

              {/* Amount */}
              <div>
                <label
                  htmlFor="withdraw-amount"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-2"
                >
                  Amount ({currency})
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
