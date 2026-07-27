'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Smartphone, AlertTriangle, CheckCircle2, RefreshCw, ChevronRight, Lightbulb } from 'lucide-react'
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
  { key: 'mtn', label: 'MTN Mobile Money', short: 'MTN', brand: 'bg-amber-400 text-black border-amber-500' },
  { key: 'vod', label: 'Telecel Cash', short: 'Telecel', brand: 'bg-red-500 text-white border-red-600' },
  { key: 'atl', label: 'AirtelTigo Money', short: 'AT', brand: 'bg-blue-500 text-white border-blue-600' },
]

// Mask a phone for the "switch" row (e.g. "0591234937" → "059****937").
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7) return raw || '—'
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`
}

const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 120_000

interface MobileMoneyFormProps {
  userId: string
  /** Minimum deposit for the user's country. Seeds the amount input. */
  minAmount: number
  /** Maximum per-transaction deposit (shown in the info list). */
  maxAmount?: number
  /** Current wallet balance, shown above the amount input. */
  balance?: number
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
  minAmount,
  maxAmount = 50_000,
  balance,
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
  const [amountStr, setAmountStr] = useState(minAmount ? String(minAmount) : '')
  const amount = Number(amountStr) || 0
  // "Switch" toggles: the network picker and the phone editor.
  const [switchingNetwork, setSwitchingNetwork] = useState(false)
  const [editingPhone, setEditingPhone] = useState(!defaultPhone)
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
      setEditingPhone(true)
      setError('Enter the phone number tied to your mobile-money wallet.')
      return
    }
    if (amount < minAmount) {
      setError(`Minimum deposit is ${currency} ${minAmount.toFixed(2)}.`)
      return
    }
    if (amount > maxAmount) {
      setError(`Maximum per transaction is ${currency} ${maxAmount.toLocaleString()}.`)
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
      // Flutterwave Ghana mobile money authorizes on a hosted page (OTP / PIN):
      // send the customer there. They come back and the webhook/poll credits.
      if (data.redirect) {
        window.location.href = data.redirect as string
        return
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
    // Show the code box whenever the gateway supports validating one — some
    // networks (e.g. MTN GH on Flutterwave) send an SMS code to enter here;
    // others authorize by phone prompt (the box notes that too).
    const canOtp = Boolean((endpoints as { validate?: string | null }).validate)
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

  const activeProvider = PROVIDERS.find((p) => p.key === provider)!
  const canPay = amount >= minAmount && amount <= maxAmount && phone.replace(/\D/g, '').length >= 9

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Phone number row — masked, with "Switch" to edit */}
      {editingPhone ? (
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-muted-foreground shrink-0" />
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="0244 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-8 border-0 bg-transparent px-0 font-mono tabular-nums text-base focus-visible:ring-0"
              autoComplete="tel"
              autoFocus={!defaultPhone}
            />
            {defaultPhone && (
              <button
                type="button"
                onClick={() => { setPhone(defaultPhone); setEditingPhone(false) }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingPhone(true)}
          className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3 text-left hover:border-primary/40 transition-colors"
        >
          <span className="flex items-center gap-3 min-w-0">
            <Smartphone className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="font-semibold tabular-nums text-foreground">{maskPhone(phone)}</span>
          </span>
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary shrink-0">
            Switch <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Network row — current network, with "Switch" to change */}
      <div>
        <button
          type="button"
          onClick={() => setSwitchingNetwork((v) => !v)}
          className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3 text-left hover:border-primary/40 transition-colors"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className={`grid place-items-center w-8 h-8 rounded-md border text-[10px] font-extrabold shrink-0 ${activeProvider.brand}`}>
              {activeProvider.short}
            </span>
            <span className="font-semibold text-foreground truncate">{activeProvider.label}</span>
          </span>
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary shrink-0">
            Switch <ChevronRight className={`w-4 h-4 transition-transform ${switchingNetwork ? 'rotate-90' : ''}`} />
          </span>
        </button>
        {switchingNetwork && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {PROVIDERS.map((p) => {
              const selected = provider === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setProvider(p.key); setSwitchingNetwork(false) }}
                  className={`relative py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all ${
                    selected ? `${p.brand} shadow-card-pressed` : 'bg-secondary text-foreground border-border hover:border-primary/40'
                  }`}
                >
                  {p.short}
                  {selected && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Balance line */}
      {typeof balance === 'number' && (
        <div className="flex items-center justify-end gap-1.5 pt-1 text-sm">
          <Lightbulb className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">
            Balance ({currency}) <span className="font-bold text-foreground tabular-nums">{balance.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Amount input — label left, value right */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 h-16">
        <label htmlFor="momo-amount" className="text-base font-semibold text-foreground shrink-0">
          Amount ({currency})
        </label>
        <input
          id="momo-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={minAmount}
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder={`min. ${minAmount.toFixed(2)}`}
          className="flex-1 min-w-0 bg-transparent text-right text-2xl font-extrabold tabular-nums text-foreground placeholder:text-muted-foreground/60 placeholder:text-base placeholder:font-medium outline-none"
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting || !canPay}
        className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base shadow-card hover:shadow-card-hover disabled:opacity-50 transition-all"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Sending prompt…
          </>
        ) : (
          'Top Up Now'
        )}
      </Button>

      {/* Info list */}
      <ol className="pt-2 space-y-1.5 text-[13px] text-muted-foreground leading-relaxed list-decimal pl-5">
        <li>
          The maximum amount per transaction is {currency}{' '}
          <span className="font-bold text-foreground">{maxAmount.toLocaleString()}.00</span>. To deposit more, make multiple payments.
        </li>
        <li>
          The minimum amount you can deposit is {currency}{' '}
          <span className="font-bold text-foreground">{minAmount.toFixed(2)}</span>.
        </li>
        <li>There are no transaction fees — the deposit is free.</li>
        <li>You can only withdraw your balance to the mobile number you used to create your account.</li>
      </ol>

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
