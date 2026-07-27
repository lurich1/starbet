'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldCheck, Mail, Lock } from 'lucide-react'
import { AuthField, AuthButton, PortalAuthShell } from '@/components/auth-shell'

function Form() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/sub-admin/dashboard'

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/sub-admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
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
      icon={ShieldCheck}
      badge="Partner"
      title="Partner sign-in"
      subtitle="Access your referral dashboard."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          icon={Mail}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="jane@example.com"
          required
          autoFocus
        />
        <AuthField
          icon={Lock}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Password"
          required
        />

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <AuthButton type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
            </>
          ) : (
            'Sign In'
          )}
        </AuthButton>

        <p className="text-center text-xs text-gray-500 pt-2">
          Not a partner yet?{' '}
          <Link href="/sub-admin/register" className="text-[#8bc34a] hover:underline font-semibold">
            Register
          </Link>
        </p>
      </form>
    </PortalAuthShell>
  )
}

export default function SubAdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1117]" />}>
      <Form />
    </Suspense>
  )
}
