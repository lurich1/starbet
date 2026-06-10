'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, ArrowLeft, Check, Loader2, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveUserSession } from '@/lib/user-session'
import {
  DEFAULT_COUNTRY,
  getCountry,
  listCountries,
  type CountryCode,
} from '@/lib/countries'

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()

  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const countryCfg = getCountry(country)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [kyc, setKyc] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Lazy-init from ?ref= so the real referral code is on the field at first
  // paint — no demo flash, no useEffect tick.
  const [referralCode, setReferralCode] = useState(() =>
    (params.get('ref') ?? '').toUpperCase(),
  )
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the field in sync if the ref param changes mid-page (e.g. router swap).
  useEffect(() => {
    const ref = params.get('ref')
    if (ref) setReferralCode(ref.toUpperCase())
  }, [params])

  const passwordRequirements = [
    { text: 'At least 6 characters', met: password.length >= 6 },
    { text: 'Passwords match', met: !!password && password === confirmPassword },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          country,
          kyc: kyc.trim(),
          password,
          referralCode: referralCode.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      const userId = data.user.id as string
      const userName = (data.user.name as string) || name.trim()
      saveUserSession(userId, userName)
      const wasReferred = !!data.user.referredByCode
      if (wasReferred) {
        router.push(`/users/first-deposit?userId=${userId}`)
      } else {
        router.push('/me')
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
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
            <span>Back</span>
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
          <div className="w-16" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 py-8">
        <div className="relative w-full max-w-md">
          {/* Ambient glows match the login + balance card visual language */}
          <div aria-hidden className="absolute -top-16 -left-12 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute -bottom-16 -right-12 w-56 h-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-card ring-1 ring-primary/10">
            <div className="text-center mb-6">
              <h1 className="text-title font-bold text-foreground mb-1.5 tracking-tight">Create account</h1>
              <p className="text-muted-foreground text-sm">
                Join Prime Bet and start winning today
              </p>
            </div>

            {referralCode && (
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 mb-5 flex items-center gap-3 shadow-card">
                <span className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-eyebrow text-muted-foreground">Referred by</p>
                  <p className="font-mono text-sm text-primary tracking-wider font-bold leading-tight">
                    {referralCode}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="country" className="text-sm font-medium text-foreground">
                  Country
                </label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value as CountryCode)}
                  className="h-11 w-full rounded-md bg-secondary border border-border px-3 text-sm text-foreground"
                  required
                >
                  {listCountries().map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag}  {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Your wallet will be in {countryCfg.currency}.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-foreground">
                  Full name
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 bg-secondary border-border"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-secondary border-border"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phone" className="text-sm font-medium text-foreground">
                  Phone number
                </label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder={`+${countryCfg.dialCode} …`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 bg-secondary border-border"
                  autoComplete="tel"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  We use this when paying out withdrawals. {countryCfg.name} numbers
                  accepted with or without +{countryCfg.dialCode}.
                </p>
              </div>

              {countryCfg.requiresKyc && (
                <div className="space-y-1.5">
                  <label htmlFor="kyc" className="text-sm font-medium text-foreground">
                    {countryCfg.kycLabel}
                  </label>
                  <Input
                    id="kyc"
                    type="text"
                    inputMode="text"
                    placeholder={countryCfg.kycPlaceholder}
                    value={kyc}
                    onChange={(e) => setKyc(country === 'GH' ? e.target.value.toUpperCase() : e.target.value)}
                    className="h-11 bg-secondary border-border tracking-wider font-mono"
                    maxLength={country === 'GH' ? 15 : 20}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required for account verification.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 h-11 bg-secondary border-border"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="space-y-1 pt-1">
                  {passwordRequirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          req.met ? 'bg-success text-success-foreground' : 'bg-muted'
                        }`}
                      >
                        {req.met && <Check className="w-3 h-3" />}
                      </div>
                      <span className={req.met ? 'text-success' : 'text-muted-foreground'}>
                        {req.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-foreground"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10 h-11 bg-secondary border-border"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="referral" className="text-sm font-medium text-foreground">
                  Referral Code <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="referral"
                  type="text"
                  placeholder=""
                  value={referralCode}
                  onChange={(e) =>
                    setReferralCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    )
                  }
                  maxLength={8}
                  className="h-11 bg-secondary border-border uppercase tracking-widest font-mono"
                />
              </div>

              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-border bg-input accent-primary"
                  required
                />
                <label htmlFor="terms" className="text-xs text-muted-foreground">
                  I agree to the{' '}
                  <Link href="#" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="#" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !acceptTerms}
                className="w-full h-12 bg-gradient-to-b from-primary to-primary/85 text-primary-foreground hover:brightness-110 font-bold text-sm shadow-lg shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account…
                  </>
                ) : (
                  'Create account'
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground pt-2">
                Already have an account?{' '}
                <Link href="/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RegisterForm />
    </Suspense>
  )
}
