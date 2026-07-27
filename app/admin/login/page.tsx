'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ShieldAlert, Lock } from 'lucide-react'
import { AuthField, AuthButton, PortalAuthShell } from '@/components/auth-shell'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/admin'
  const disabled = params.get('disabled') === '1'

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (disabled) {
      setError(
        'Admin is disabled — set ADMIN_PASSWORD in .env.local and restart the dev server.',
      )
    }
  }, [disabled])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      router.push(next)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PortalAuthShell
      icon={ShieldAlert}
      badge="Admin"
      title="Admin sign-in"
      subtitle="Enter the password set in your .env.local"
      footer="Gated by a single shared password. Rotate it by changing ADMIN_PASSWORD in .env.local."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          icon={Lock}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          required
          autoFocus
        />

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <AuthButton type="submit" disabled={loading || disabled}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
            </>
          ) : (
            'Sign In'
          )}
        </AuthButton>
      </form>
    </PortalAuthShell>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1117]" />}>
      <LoginForm />
    </Suspense>
  )
}
