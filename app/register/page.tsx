'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Check, Loader2, Gift, Lock, User, Mail, Phone, IdCard } from 'lucide-react'
import { AuthShell, AuthField, AuthButton } from '@/components/auth-shell'
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
  const [referralCode, setReferralCode] = useState(() =>
    (params.get('ref') ?? '').toUpperCase(),
  )
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ref = params.get('ref')
    if (ref) setReferralCode(ref.toUpperCase())
  }, [params])

  const referralLocked = Boolean(params.get('ref'))

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
      if (data.user.referredByCode) {
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
    <AuthShell active="register">
      {referralCode && (
        <div className="bg-[#8bc34a]/10 border border-[#8bc34a]/30 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-[#8bc34a]/15 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4 text-[#8bc34a]" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Referred by</p>
            <p className="font-mono text-sm text-[#8bc34a] tracking-wider font-bold leading-tight">
              {referralCode}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Country */}
        <div className="relative">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as CountryCode)}
            className="w-full h-12 rounded-xl bg-[#1b212b] border border-[#2a323e] px-4 text-sm text-white outline-none focus:border-[#8bc34a]/70 focus:ring-2 focus:ring-[#8bc34a]/30 appearance-none"
            required
          >
            {listCountries().map((c) => (
              <option key={c.code} value={c.code} className="bg-[#161b22]">
                {c.flag}  {c.name} ({c.currency})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1 px-1">
            Your wallet will be in {countryCfg.currency}.
          </p>
        </div>

        <AuthField
          icon={User}
          type="text"
          placeholder="Create username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <AuthField
          icon={Mail}
          type="email"
          placeholder="Enter your e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <AuthField
          icon={Phone}
          type="tel"
          inputMode="tel"
          placeholder={`Phone number (+${countryCfg.dialCode})`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          required
        />

        {countryCfg.requiresKyc && (
          <AuthField
            icon={IdCard}
            type="text"
            placeholder={`${countryCfg.kycLabel} — ${countryCfg.kycPlaceholder}`}
            value={kyc}
            onChange={(e) => setKyc(country === 'GH' ? e.target.value.toUpperCase() : e.target.value)}
            maxLength={country === 'GH' ? 15 : 20}
            className="tracking-wider font-mono"
            required
          />
        )}

        <AuthField
          icon={Lock}
          type={showPassword ? 'text' : 'password'}
          placeholder="Create password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-500 hover:text-white transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          }
        />
        <AuthField
          icon={Lock}
          type={showConfirmPassword ? 'text' : 'password'}
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="text-gray-500 hover:text-white transition-colors"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          }
        />

        <div className="flex items-center gap-4 pt-0.5">
          {passwordRequirements.map((req, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  req.met ? 'bg-[#8bc34a] text-[#0d1117]' : 'bg-[#232a35]'
                }`}
              >
                {req.met && <Check className="w-3 h-3" />}
              </span>
              <span className={req.met ? 'text-[#8bc34a]' : 'text-gray-500'}>{req.text}</span>
            </div>
          ))}
        </div>

        {/* Referral code */}
        <div className="relative">
          <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Referral code (optional)"
            value={referralCode}
            onChange={(e) => {
              if (referralLocked) return
              setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }}
            maxLength={8}
            readOnly={referralLocked}
            className={`w-full h-12 rounded-xl bg-[#1b212b] border border-[#2a323e] pl-11 pr-11 text-sm text-white uppercase tracking-widest font-mono placeholder:text-gray-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans outline-none focus:border-[#8bc34a]/70 focus:ring-2 focus:ring-[#8bc34a]/30 ${
              referralLocked ? 'opacity-90 cursor-not-allowed' : ''
            }`}
          />
          {referralLocked && (
            <Lock className="w-4 h-4 text-gray-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
          )}
        </div>

        <label className="flex items-start gap-2 text-xs text-gray-400 pt-0.5">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded border-[#2a323e] bg-[#1b212b] accent-[#8bc34a]"
            required
          />
          <span>
            By accessing I confirm that I am at least 18 and agree to the{' '}
            <Link href="#" className="text-[#8bc34a] font-semibold hover:brightness-110">
              Terms of Service
            </Link>
            .
          </span>
        </label>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <AuthButton type="submit" disabled={loading || !acceptTerms}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
            </>
          ) : (
            'Sign Up'
          )}
        </AuthButton>

        <p className="text-center text-sm text-gray-400 pt-1">
          Already have an account?{' '}
          <Link href="/login" className="text-[#8bc34a] font-semibold hover:brightness-110">
            Log In
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1117]" />}>
      <RegisterForm />
    </Suspense>
  )
}
