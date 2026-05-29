'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, ArrowLeft, Wallet, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveUserSession } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import {
  DEFAULT_COUNTRY,
  DEFAULT_CURRENCY,
  getCountry,
  getMinFirstDeposit,
  isCountryCode,
  isCurrencyCode,
  type CountryCode,
  type CurrencyCode,
} from '@/lib/countries'

interface UserProfile {
  id: string
  name: string
  email?: string
  country?: string
  currency?: string
  totalDeposited: number
  totalWithdrawn: number
  balance: number
  firstDepositAt?: string | null
}

function DepositForm() {
  const router = useRouter()
  const params = useSearchParams()
  const userId = params.get('userId') ?? ''
  const moolreStatus = params.get('moolre')
  const moolreReason = params.get('reason')
  const paystackStatus = params.get('paystack')

  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(Boolean(userId))
  // When the user comes back from Moolre with ?moolre=success we re-fetch
  // the profile and show the success screen built from the fresh totals.
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (!userId) {
      setProfileLoading(false)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    fetch(`/api/users/${userId}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UserProfile | null) => {
        if (!cancelled) setProfile(data)
      })
      .catch(() => {
        if (!cancelled) setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Handle the redirect back from Moolre / Paystack. On success we save the
  // session and flip the page to the success card; on failure we surface the
  // reason (without clearing the form).
  useEffect(() => {
    if (moolreStatus === 'success' || paystackStatus === 'success' || paystackStatus === 'already-credited') {
      if (userId) saveUserSession(userId)
      setShowSuccess(true)
      return
    }
    if (moolreStatus === 'failed') {
      setError(
        moolreReason
          ? `Payment failed: ${moolreReason}`
          : 'Payment failed. Try again or contact support.',
      )
      return
    }
    if (paystackStatus && paystackStatus !== 'success' && paystackStatus !== 'already-credited') {
      setError(`Payment did not complete (${paystackStatus}). Try again or contact support.`)
    }
  }, [moolreStatus, moolreReason, paystackStatus, userId])

  // Country / currency derived from the loaded profile, with safe defaults.
  const country: CountryCode = isCountryCode(profile?.country) ? profile!.country as CountryCode : DEFAULT_COUNTRY
  const currency: CurrencyCode = isCurrencyCode(profile?.currency) ? profile!.currency as CurrencyCode : DEFAULT_CURRENCY
  const countryCfg = getCountry(country)
  const minAmount = getMinFirstDeposit(country)
  const gateway = countryCfg.gateway

  // Seed the amount input with the country's min once the profile loads.
  useEffect(() => {
    if (!amount && profile) setAmount(String(minAmount))
  }, [profile, minAmount, amount])

  const isReturning = Boolean(profile?.firstDepositAt) && !showSuccess
  const headingTitle = showSuccess
    ? 'Deposit successful'
    : isReturning
      ? 'Add funds to your wallet'
      : 'Make your first deposit'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!userId) {
      setError('Missing userId in URL.')
      return
    }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a positive amount.')
      return
    }
    if (amt < minAmount) {
      setError(`Minimum deposit is ${currency} ${minAmount.toFixed(2)}.`)
      return
    }
    if (!profile) {
      setError('Profile not loaded yet — wait a moment and try again.')
      return
    }

    setLoading(true)
    try {
      const endpoint = gateway === 'moolre'
        ? '/api/payments/moolre/start'
        : '/api/payments/paystack/start'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          amount: amt,
          purpose: 'deposit',
          returnPath: `/users/first-deposit?userId=${profile.id}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      // Full-page redirect to the gateway's hosted checkout. The user pays
      // on their page and is sent back to /users/first-deposit?moolre=… or
      // ?paystack=… depending on the gateway.
      window.location.href = data.url as string
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Skip</span>
          </Link>
          <Link href="/" className="flex items-center" aria-label="Prime Bet home">
            <Image
              src="/primebet.png"
              alt="Prime Bet"
              width={282}
              height={123}
              className="logo-img h-7 w-auto"
            />
          </Link>
          <div className="w-12" />
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center p-4 py-8">
        <div className="relative w-full max-w-md">
          {/* Ambient glow blobs match the auth visual language */}
          <div aria-hidden className="absolute -top-16 -left-12 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute -bottom-16 -right-12 w-56 h-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative bg-card rounded-2xl border border-border p-5 sm:p-8 shadow-card">
            {showSuccess && profile ? (
              <div className="text-center space-y-4">
                <div className="relative w-16 h-16 mx-auto">
                  <div aria-hidden className="absolute inset-0 rounded-2xl bg-success/20 blur-xl" />
                  <div className="relative w-16 h-16 rounded-2xl bg-success/15 border border-success/30 flex items-center justify-center shadow-card">
                    <CheckCircle2 className="w-8 h-8 text-success" />
                  </div>
                </div>
                <h1 className="text-title font-bold tracking-tight">{headingTitle}</h1>
                <div className="bg-secondary/60 border border-border rounded-xl p-4 text-left space-y-2">
                  <Row
                    label="Total deposited"
                    value={`${currency} ${formatMoney(profile.totalDeposited, currency)}`}
                  />
                  <Row
                    label="New balance"
                    value={`${currency} ${formatMoney(profile.balance, currency)}`}
                    tone="good"
                    bold
                  />
                </div>
                <Button
                  onClick={() => router.push('/me')}
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0 transition-all"
                >
                  View account
                </Button>
              </div>
            ) : (
              <>
                {profile && (
                  <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-secondary/60 border border-border shadow-card">
                    <div className="w-11 h-11 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center text-base font-bold text-primary shrink-0">
                      {profile.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">
                        {profile.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate font-mono">
                        ID: {profile.id.slice(0, 8)}…
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-eyebrow text-muted-foreground">Balance</p>
                      <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                        {currency} {formatMoney(profile.balance, currency)}
                      </p>
                    </div>
                  </div>
                )}
                {!profile && !profileLoading && userId && (
                  <div className="mb-5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium">
                    Could not load profile for this user.
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className="relative w-14 h-14 mx-auto mb-3">
                    <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/25 blur-xl" />
                    <div className="relative w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-card">
                      <Wallet className="w-7 h-7 text-primary" />
                    </div>
                  </div>
                  <h1 className="text-title font-bold text-foreground tracking-tight">{headingTitle}</h1>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    {gateway === 'moolre'
                      ? 'Pay with MTN, Telecel or AT Money on Moolre.'
                      : `Pay with card or bank on Paystack (${countryCfg.name}).`}
                    {' '}Minimum deposit: <span className="text-foreground font-semibold">{currency} {minAmount}</span>.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-eyebrow text-muted-foreground block mb-2">
                      Amount ({currency})
                    </label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={minAmount}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="text-2xl h-14 bg-secondary border-border font-extrabold tabular-nums"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[minAmount, minAmount * 1.5, minAmount * 2.5, minAmount * 5]
                      .map((n) => Math.round(n).toString())
                      .map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmount(preset)}
                          className={`py-2 rounded-lg text-sm font-bold transition-all ${
                            amount === preset
                              ? 'bg-primary text-primary-foreground shadow-card-pressed'
                              : 'bg-secondary text-foreground hover:bg-secondary/70 hover:-translate-y-0.5 hover:shadow-card'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>
                      You&apos;ll be redirected to <span className="font-semibold text-foreground">{gateway === 'moolre' ? 'Moolre' : 'Paystack'}</span> to pay.
                      {gateway === 'moolre'
                        ? ' Your balance is credited within a few minutes of payment — check '
                        : ' Your balance is credited automatically once the payment confirms — check '}
                      <strong className="text-foreground">My Account</strong> after.
                    </span>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !profile}
                    className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0 transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      `Pay ${currency} ${Number(amount || 0).toFixed(2)}`
                    )}
                  </Button>

                  <p className="text-center text-[11px] text-muted-foreground">
                    Secured by {gateway === 'moolre' ? 'Moolre' : 'Paystack'} · You can deposit later from your account
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function Row({
  label,
  value,
  tone = 'neutral',
  bold = false,
}: {
  label: string
  value: string
  tone?: 'good' | 'neutral'
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums text-right ${bold ? 'text-lg font-bold' : 'text-sm font-semibold'} ${
          tone === 'good' ? 'text-success' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

export default function FirstDepositPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DepositForm />
    </Suspense>
  )
}
