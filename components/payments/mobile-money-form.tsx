'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Smartphone, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Provider = 'mtn' | 'vod' | 'atl'

interface ProviderOption {
  key: Provider
  label: string
  short: string
  brand: string
}

const PROVIDERS: ProviderOption[] = [
  { key: 'mtn', label: 'MTN MoMo', short: 'MTN', brand: 'bg-amber-400 text-black border-amber-500' },
  { key: 'vod', label: 'Telecel Cash', short: 'Telecel', brand: 'bg-red-500 text-white border-red-600' },
  { key: 'atl', label: 'AirtelTigo', short: 'AT', brand: 'bg-blue-500 text-white border-blue-600' },
]

const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 120_000

interface MobileMoneyFormProps {
  userId: string
  amount: number
  currency: string
  defaultPhone?: string | null
  purpose: 'deposit' | 'verification'
  /** Which gateway processes the charge. Defaults to Paystack. */
  gateway?: 'paystack' | 'flutterwave'
  /** Called when the charge resolves successfully (after server credit). */
  onSuccess: () => void
  /** Optional: surface a fallback to the card flow. */
  onSwitchToCard?: () => void
}

// Per-gateway charge + status endpoints. Both return { ok, status } shaped
// responses the poller below understands.
const ENDPOINTS = {
  paystack: {
    start: '/api/payments/paystack/momo/start',
    status: (ref: string) => `/api/payments/paystack/momo/status?reference=${encodeURIComponent(ref)}`,
    validate: '/api/payments/paystack/momo/validate' as string | null,
  },
  flutterwave: {
    start: '/api/payments/flutterwave/momo/start',
    status: (ref: string) => `/api/payments/flutterwave/status?reference=${encodeURIComponent(ref)}`,
    validate: '/api/payments/flutterwave/momo/validate' as string | null,
  },
} as const

type Phase =
  | { kind: 'form' }
  | { kind: 'awaiting'; reference: string; displayText: string | null; startedAt: number; needsOtp: boolean }
  | { kind: 'failed'; reason: string }

export function MobileMoneyForm({
  userId,
  amount,
  currency,
  defaultPhone,
  purpose,
  gateway = 'paystack',
  onSuccess,
  onSwitchToCard,
}: MobileMoneyFormProps) {
  const endpoints = ENDPOINTS[gateway]
  const [provider, setProvider] = useState<Provider>('mtn')
  const [phone, setPhone] = useState(defaultPhone ?? '')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpDone, setOtpDone] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up any pending polling timer when the component unmounts or the
  // phase changes away from 'awaiting'.
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])

  useEffect(() => {
    if (phase.kind !== 'awaiting') {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current)
        pollTimer.current = null
      }
      return
    }

    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(endpoints.status(phase.reference), { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const status: string | undefined = data?.status
        const ok: boolean = Boolean(data?.ok)

        if (cancelled) return

        if (ok && (status === 'success' || status === 'already-credited')) {
          onSuccess()
          return
        }

        const terminalFailures = new Set([
          'failed',
          'abandoned',
          'amount-mismatch',
          'verify-failed',
          'credit-failed',
          'no-user',
          'unknown-reference',
          'missing-reference',
        ])
        if (status && terminalFailures.has(status)) {
          setPhase({
            kind: 'failed',
            reason: friendlyFailure(status),
          })
          return
        }

        // Still pending — keep polling unless we've blown past the timeout.
        if (Date.now() - phase.startedAt > POLL_TIMEOUT_MS) {
          setPhase({
            kind: 'failed',
            reason: 'No response from your phone. The prompt may have expired — try again.',
          })
          return
        }
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        if (cancelled) return
        // Network blip — keep polling.
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }
    // First poll fires after the interval so the prompt has time to arrive.
    pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (pollTimer.current) {
        clearTimeout(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [phase, onSuccess, endpoints])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!phone.trim()) {
      setError('Enter the phone number tied to your mobile-money wallet.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(endpoints.start, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount,
          phone: phone.trim(),
          provider,
          purpose,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.reference) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const status: string | undefined = data.status
      if (status === 'success') {
        // Rare for mobile money but possible — already debited.
        onSuccess()
        return
      }
      if (status === 'failed') {
        throw new Error(data.displayText ?? 'Charge failed.')
      }
      setPhase({
        kind: 'awaiting',
        reference: data.reference,
        displayText: data.displayText ?? null,
        startedAt: Date.now(),
        needsOtp: data.authMode === 'otp' || data.authMode === 'otp-verify',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Submit the SMS code (Flutterwave OTP flow). Polling continues and flips to
  // success once the validated charge clears.
  const submitOtp = async () => {
    if (phase.kind !== 'awaiting') return
    const validateUrl = (endpoints as { validate?: string | null }).validate
    if (!validateUrl) return
    if (!otp.trim()) {
      setOtpError('Enter the code you received by SMS.')
      return
    }
    setOtpSubmitting(true)
    setOtpError(null)
    try {
      const res = await fetch(validateUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: phase.reference, otp: otp.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'That code was not accepted.')
      setOtp('')
      setOtpDone(true)
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : String(err))
    } finally {
      setOtpSubmitting(false)
    }
  }

  const restart = () => {
    setPhase({ kind: 'form' })
    setError(null)
    setOtp('')
    setOtpError(null)
    setOtpDone(false)
  }

  if (phase.kind === 'awaiting') {
    // Only show the on-screen OTP box when the gateway actually requested a code
    // (authMode 'otp'). MTN Ghana etc. use a phone approval — no code to type.
    const canOtp =
      Boolean((endpoints as { validate?: string | null }).validate) && phase.needsOtp
    return (
      <AwaitingPrompt
        provider={PROVIDERS.find((p) => p.key === provider)!}
        phone={phone}
        amount={amount}
        currency={currency}
        displayText={phase.displayText}
        onCancel={restart}
        canOtp={canOtp}
        needsOtp={phase.needsOtp}
        otp={otp}
        onOtpChange={setOtp}
        onSubmitOtp={submitOtp}
        otpSubmitting={otpSubmitting}
        otpError={otpError}
        otpDone={otpDone}
      />
    )
  }

  if (phase.kind === 'failed') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm font-semibold">{phase.reason}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={restart}
            className="flex-1 h-10"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Try again
          </Button>
          {onSwitchToCard && (
            <Button
              type="button"
              variant="outline"
              onClick={onSwitchToCard}
              className="flex-1 h-10"
            >
              Use card instead
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="text-eyebrow text-muted-foreground block mb-2">
          Mobile-money network
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => {
            const selected = provider === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setProvider(p.key)}
                className={`relative py-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  selected
                    ? `${p.brand} shadow-card-pressed`
                    : 'bg-secondary text-foreground border-border hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-card'
                }`}
              >
                <span className="block text-[10px] uppercase tracking-wide opacity-80">
                  {p.short}
                </span>
                <span className="block text-[11px] font-bold mt-0.5 whitespace-nowrap">
                  {p.label}
                </span>
                {selected && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-eyebrow text-muted-foreground block mb-2">
          Mobile-money phone number
        </label>
        <div className="relative">
          <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="tel"
            inputMode="numeric"
            placeholder="0244XXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="pl-9 h-12 bg-secondary border-border font-mono tabular-nums"
            autoComplete="tel"
            required
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          You&apos;ll get a prompt on this phone to approve {currency} {amount.toFixed(2)}.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0 transition-all"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Sending prompt…
          </>
        ) : (
          `Pay ${currency} ${amount.toFixed(2)} with ${PROVIDERS.find((p) => p.key === provider)?.short}`
        )}
      </Button>

      {onSwitchToCard && (
        <button
          type="button"
          onClick={onSwitchToCard}
          className="block mx-auto text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Pay with card instead
        </button>
      )}
    </form>
  )
}

function AwaitingPrompt({
  provider,
  phone,
  amount,
  currency,
  displayText,
  onCancel,
  canOtp,
  needsOtp,
  otp,
  onOtpChange,
  onSubmitOtp,
  otpSubmitting,
  otpError,
  otpDone,
}: {
  provider: ProviderOption
  phone: string
  amount: number
  currency: string
  displayText: string | null
  onCancel: () => void
  canOtp: boolean
  needsOtp: boolean
  otp: string
  onOtpChange: (v: string) => void
  onSubmitOtp: () => void
  otpSubmitting: boolean
  otpError: string | null
  otpDone: boolean
}) {
  const fallback =
    provider.key === 'vod'
      ? 'Dial *422# on your Telecel line to generate an approval code, then approve the request there.'
      : `Check ${phone} for an MMO prompt and enter your PIN to approve ${currency} ${amount.toFixed(2)}.`
  return (
    <div className="space-y-4 text-center">
      <div className="relative w-16 h-16 mx-auto">
        <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-card">
          <Smartphone className="w-8 h-8 text-primary" />
        </div>
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Loader2 className="w-3 h-3 animate-spin" />
        </span>
      </div>
      <div>
        <p className="text-sm font-bold text-foreground">
          {needsOtp ? 'Enter the code' : 'Check your phone'}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          {needsOtp
            ? `Enter the code sent by SMS to ${phone} to approve ${currency} ${amount.toFixed(2)}.`
            : displayText ?? fallback}
        </p>
      </div>

      {/* OTP code entry — for the Flutterwave SMS-code flow. Always available so
          a customer who receives a code always has somewhere to type it. */}
      {canOtp && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2 text-left">
          <label className="text-eyebrow text-muted-foreground block">
            Payment code (from SMS)
          </label>
          {otpDone ? (
            <div className="flex items-center gap-2 text-success text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Code submitted — confirming your payment…
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter code"
                  value={otp}
                  onChange={(e) => onOtpChange(e.target.value)}
                  className="h-11 bg-background border-border font-mono tabular-nums tracking-widest text-center"
                />
                <Button
                  type="button"
                  onClick={onSubmitOtp}
                  disabled={otpSubmitting || !otp.trim()}
                  className="h-11 px-4 bg-primary text-primary-foreground font-bold shrink-0"
                >
                  {otpSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit'}
                </Button>
              </div>
              {otpError && (
                <p className="text-[11px] text-destructive flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {otpError}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                No code? Just approve the prompt on your phone — this page updates automatically.
              </p>
            </>
          )}
        </div>
      )}
      <div className="rounded-xl bg-secondary/60 border border-border p-3 text-left space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Network</span>
          <span className="font-bold text-foreground">{provider.label}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Phone</span>
          <span className="font-mono text-foreground">{phone}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-bold text-foreground tabular-nums">
            {currency} {amount.toFixed(2)}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        We&apos;ll update this page as soon as you approve. The prompt usually arrives within 30 seconds.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="w-full h-10"
      >
        Cancel and start over
      </Button>
    </div>
  )
}

function friendlyFailure(status: string): string {
  switch (status) {
    case 'failed':
      return 'The mobile-money charge was declined. Check your balance and try again.'
    case 'abandoned':
      return 'The prompt was dismissed before you approved it. Try again.'
    case 'amount-mismatch':
      return 'The amount we received doesn\'t match. Contact support.'
    case 'verify-failed':
      return 'We couldn\'t reach the gateway to confirm your payment. Try again in a moment.'
    case 'credit-failed':
      return 'Payment confirmed but we couldn\'t credit your wallet. Contact support — we have the transaction reference.'
    default:
      return `Payment didn't complete (${status}). Try again or contact support.`
  }
}
