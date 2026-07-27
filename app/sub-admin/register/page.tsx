'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, UserPlus, User, Mail, Lock } from 'lucide-react'
import { AuthField, AuthButton, PortalAuthShell } from '@/components/auth-shell'

export default function SubAdminRegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/sub-admin/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      router.push('/sub-admin/dashboard')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PortalAuthShell
      icon={UserPlus}
      badge="Partner"
      title="Become a partner"
      subtitle="Earn 65% commission on every deposit from users who sign up with your referral code."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          icon={User}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Your name"
          required
          autoFocus
        />
        <AuthField
          icon={Mail}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="jane@example.com"
          required
        />
        <AuthField
          icon={Lock}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="At least 6 characters"
          required
          minLength={6}
        />

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <AuthButton type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
            </>
          ) : (
            'Create Partner Account'
          )}
        </AuthButton>

        <p className="text-center text-xs text-gray-500 pt-2">
          Already a partner?{' '}
          <Link href="/sub-admin/login" className="text-[#8bc34a] hover:underline font-semibold">
            Sign in
          </Link>
        </p>
      </form>
    </PortalAuthShell>
  )
}
