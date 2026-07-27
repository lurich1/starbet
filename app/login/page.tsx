'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react'
import { AuthShell, AuthField, AuthButton } from '@/components/auth-shell'
import { saveUserSession } from '@/lib/user-session'
import { SUPPORT_TELEGRAM_URL } from '@/lib/support'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      saveUserSession(data.user.id, data.user.name)
      router.push('/me')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell active="login">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          icon={Mail}
          type="text"
          inputMode="email"
          placeholder="Email or phone number"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
        />

        <AuthField
          icon={Lock}
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
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

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-[#2a323e] bg-[#1b212b] accent-[#8bc34a]"
            />
            Remember me
          </label>
          <Link href="#" className="text-xs font-medium text-[#8bc34a] hover:brightness-110">
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <AuthButton type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
            </>
          ) : (
            'Log In'
          )}
        </AuthButton>

        <p className="text-center text-sm text-gray-400 pt-1">
          {"Don't have an account? "}
          <Link href="/register" className="text-[#8bc34a] font-semibold hover:brightness-110">
            Register
          </Link>
        </p>

        <p className="text-center text-xs text-gray-500">
          Need help?{' '}
          <Link
            href={SUPPORT_TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#8bc34a] font-medium hover:brightness-110"
          >
            Contact Support
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
