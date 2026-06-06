'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Loader2,
  ArrowLeft,
  Wallet,
  CheckCircle2,
  Info,
  AlertTriangle,
  Copy,
  Check,
  Upload,
  Building2,
} from 'lucide-react'
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
  firstDepositAt?: string | null
}

type PayMode = 'momo' | 'card'

// Hard-coded Nigeria manual-deposit bank details — shown to NG players in
// the manual-flow branch below. Keep in sync with whatever account the
// operator is actually receiving transfers into.
const MANUAL_BANK_DETAILS_NG = {
  bankName: 'MOREMONEE',
  accountNumber: '7011638185',
  accountName: 'IBRAHIM ABDULLAHI',
}

function DepositForm() {
  const router = useRouter()
  const params = useSearchParams()
  const userId = params.get('userId') ?? ''
  const moolreStatus = params.get('moolre')
  const moolreReason = params.get('reason')
  const paystackStatus = params.get('paystack')
  const purposeParam = params.get('purpose')
  const purpose: 'deposit' | 'verification' =
    purposeParam === 'verification' ? 'verification' : 'deposit'

  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(Boolean(userId))
  const [payMode, setPayMode] = useState<PayMode>('momo')
  // When the user comes back from Moolre with ?moolre=success we re-fetch
  // the profile and show the success screen built from the fresh totals.
  const [showSuccess, setShowSuccess] = useState(false)
  // Manual-deposit flow state (Nigeria)
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [manualSubmitted, setManualSubmitted] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Shared "deposit confirmed" handler used by both the card Inline JS popup
  // and the custom mobile-money flow. Pulls fresh totals so the success card
  // reflects the new balance.
  const handleDepositSuccess = async () => {
    if (!profile) return
    try {
      const me = await fetch(`/api/users/${profile.id}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      if (me) setProfile(me)
    } finally {
      saveUserSession(profile.id)
      setShowSuccess(true)
      setLoading(false)
    }
  }

  // Mobile-money custom UI is GH-only (Paystack Charge API supports MoMo
  // for GHS today). Card flow is the fallback / cross-country default.
  const momoAvailable = gateway === 'paystack' && country === 'GH'
  const showMoMoFlow = momoAvailable && payMode === 'momo' && Boolean(profile)

  const isReturning = Boolean(profile?.firstDepositAt) && !showSuccess && !manualSubmitted
  const headingTitle = showSuccess
    ? 'Deposit successful'
    : manualSubmitted
      ? 'Payment submitted'
      : purpose === 'verification'
        ? `Verify ${currency} ${minAmount}`
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

    if (gateway === 'manual') {
      if (!screenshot) {
        setError('Upload a screenshot of your payment before submitting.')
        return
      }
      setLoading(true)
      try {
        const fd = new FormData()
        fd.append('userId', profile.id)
        fd.append('amount', String(amt))
        fd.append('purpose', purpose)
        fd.append('returnPath', '/me')
        fd.append('file', screenshot)
        const res = await fetch('/api/payments/manual/start', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        saveUserSession(profile.id)
        setManualSubmitted(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
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
          purpose,
          returnPath: `/users/first-deposit?userId=${profile.id}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      // Paystack: open the Inline JS popup so card collection happens in
      // Paystack's iframe (no PCI scope for us) without leaving the page.
      // Moolre still uses the legacy full-page redirect.
      if (gateway === 'paystack') {
        if (!data.publicKey) {
          throw new Error('Paystack public key not configured on server')
        }
        await openPaystackPopup({
          publicKey: data.publicKey,
          email: data.email,
          amountMinor: data.amountMinor,
          reference: data.reference,
          currency: data.currency,
          metadata: { userId: profile.id, purpose },
          onSuccess: async (reference) => {
            try {
              const vres = await fetch('/api/payments/paystack/verify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ reference }),
              })
              const vdata = await vres.json().catch(() => ({}))
              if (!vres.ok || !vdata.ok) {
                setError(
                  `Payment received but verification failed (${vdata.status ?? vres.status}). Refresh your account in a moment.`,
                )
                setLoading(false)
                return
              }
              await handleDepositSuccess()
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
              setLoading(false)
            }
          },
          onClose: () => {
            setLoading(false)
          },
        })
        return
      }

      // Moolre flow keeps the redirect for now.
      if (!data.url) {
        throw new Error('gateway did not return a redirect URL')
      }
      window.location.href = data.url as string
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  const copyValue = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      /* ignore */
    }
  }

  const onScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setScreenshot(file)
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    setScreenshotPreview(file ? URL.createObjectURL(file) : null)
  }

  // Free the object URL when the component unmounts so we don't leak blobs.
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    }
  }, [screenshotPreview])

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
            ) : manualSubmitted && profile ? (
              <div className="text-center space-y-4">
                <div className="relative w-16 h-16 mx-auto">
                  <div aria-hidden className="absolute inset-0 rounded-2xl bg-amber-500/20 blur-xl" />
                  <div className="relative w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-card">
                    <Hourglass className="w-8 h-8 text-amber-600" />
                  </div>
                </div>
                <h1 className="text-title font-bold tracking-tight">{headingTitle}</h1>
                <p className="text-sm text-muted-foreground">
                  Thanks! We received your screenshot for{' '}
                  <span className="font-bold text-foreground tabular-nums">
                    {currency} {formatMoney(Number(amount) || 0, currency)}
                  </span>
                  . An admin will verify the payment and credit your wallet shortly.
                </p>
                <div className="bg-secondary/60 border border-border rounded-xl p-4 text-left space-y-2">
                  <Row
                    label="Submitted amount"
                    value={`${currency} ${formatMoney(Number(amount) || 0, currency)}`}
                  />
                  <Row
                    label="Status"
                    value="Awaiting admin approval"
                    tone="neutral"
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
                      : gateway === 'manual'
                        ? 'Send a bank transfer to the account below, then upload your payment proof.'
                        : showMoMoFlow
                          ? 'Pay instantly with MTN MoMo, Telecel Cash or AirtelTigo Money.'
                          : `Pay securely with card or bank — the checkout opens right here.`}
                    {' '}Minimum deposit: <span className="text-foreground font-semibold">{currency} {minAmount}</span>.
                  </p>
                </div>

                {showMoMoFlow && profile ? (
                  <div className="space-y-4">
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

                    {Number(amount) >= minAmount ? (
                      <MobileMoneyForm
                        userId={profile.id}
                        amount={Number(amount)}
                        currency={currency}
                        defaultPhone={profile.phone ?? null}
                        purpose={purpose}
                        onSuccess={handleDepositSuccess}
                        onSwitchToCard={() => setPayMode('card')}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        <span>
                          Enter at least{' '}
                          <strong className="text-foreground">
                            {currency} {minAmount}
                          </strong>{' '}
                          to send a mobile-money prompt.
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {gateway === 'manual' && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-foreground">
                        <Building2 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold">Send payment to this account</span>
                      </div>
                      <BankField
                        label="Account number"
                        value={MANUAL_BANK_DETAILS_NG.accountNumber}
                        mono
                        copied={copiedField === 'account'}
                        onCopy={() => copyValue('account', MANUAL_BANK_DETAILS_NG.accountNumber)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Transfer the exact amount you enter below, then upload a screenshot of the payment as proof.
                      </p>
                    </div>
                  )}

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

                  {gateway === 'manual' && (
                    <div>
                      <label className="text-eyebrow text-muted-foreground block mb-2">
                        Payment screenshot
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        onChange={onScreenshotChange}
                        className="hidden"
                      />
                      {screenshotPreview ? (
                        <div className="relative rounded-xl border border-border bg-secondary/40 p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={screenshotPreview}
                            alt="Payment screenshot preview"
                            className="w-full max-h-72 object-contain rounded-lg"
                          />
                          <div className="mt-3 flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex-1 h-9 text-xs"
                            >
                              Change file
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setScreenshot(null)
                                if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
                                setScreenshotPreview(null)
                                if (fileInputRef.current) fileInputRef.current.value = ''
                              }}
                              className="h-9 text-xs"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full rounded-xl border-2 border-dashed border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/40 transition-colors py-6 flex flex-col items-center gap-2 text-muted-foreground"
                        >
                          <Upload className="w-5 h-5" />
                          <span className="text-xs font-medium">
                            Tap to upload payment screenshot
                          </span>
                          <span className="text-[10px] text-muted-foreground/80">
                            PNG / JPG · max 5 MB
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>
                      {gateway === 'manual' ? (
                        <>
                          After you upload your proof, an admin will verify the payment and credit your{' '}
                          <strong className="text-foreground">wallet</strong> shortly.
                        </>
                      ) : gateway === 'moolre' ? (
                        <>
                          You&apos;ll be redirected to{' '}
                          <span className="font-semibold text-foreground">Moolre</span>{' '}
                          to pay. Your balance is credited within a few minutes of payment — check{' '}
                          <strong className="text-foreground">My Account</strong> after.
                        </>
                      ) : (
                        <>
                          The{' '}
                          <span className="font-semibold text-foreground">Paystack</span>{' '}
                          checkout opens right here — your balance is credited automatically once the payment confirms.
                        </>
                      )}
                    </span>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !profile || (gateway === 'manual' && !screenshot)}
                    className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0 transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {gateway === 'manual'
                          ? 'Uploading…'
                          : gateway === 'paystack'
                            ? 'Opening checkout…'
                            : 'Redirecting…'}
                      </>
                    ) : gateway === 'manual' ? (
                      `Submit proof for ${currency} ${Number(amount || 0).toFixed(2)}`
                    ) : (
                      `Pay ${currency} ${Number(amount || 0).toFixed(2)}`
                    )}
                  </Button>

                  <p className="text-center text-[11px] text-muted-foreground">
                    {gateway === 'manual'
                      ? 'Pay via bank transfer · Admin credits your wallet after verifying the screenshot'
                      : `Secured by ${gateway === 'moolre' ? 'Moolre' : 'Paystack'} · You can deposit later from your account`}
                  </p>

                  {momoAvailable && payMode === 'card' && (
                    <button
                      type="button"
                      onClick={() => setPayMode('momo')}
                      className="block mx-auto text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                      ← Pay with mobile money instead
                    </button>
                  )}
                </form>
                )}
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

function BankField({
  label,
  value,
  mono = false,
  copied,
  onCopy,
}: {
  label: string
  value: string
  mono?: boolean
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={`text-sm font-bold text-foreground truncate ${mono ? 'font-mono tabular-nums' : ''}`}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 h-8 px-2.5 rounded-md border border-border hover:bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-success" /> Copied
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" /> Copy
          </>
        )}
      </button>
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
