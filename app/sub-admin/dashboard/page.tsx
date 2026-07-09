'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Copy,
  Check,
  LogOut,
  Loader2,
  Users,
  Wallet,
  Banknote,
  Coins,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format-money'

/** "GHS 12.34 · NGN 5,000.00" — single-line summary of a currency map. */
function formatCurrencyMap(map: Record<string, number> | undefined): string {
  if (!map) return '—'
  const entries = Object.entries(map).filter(([, v]) => v > 0)
  if (entries.length === 0) return '—'
  return entries.map(([cur, amt]) => `${cur} ${formatMoney(amt, cur)}`).join(' · ')
}

interface MeResponse {
  subAdmin: {
    id: string
    name: string
    email: string
    referralCode: string
    approved: boolean
    commissionBalance: number
    totalCommissionEarned: number
    commissionBalances: Record<string, number>
    totalCommissionEarnedBy: Record<string, number>
    createdAt: string
  }
  stats: {
    referrals: number
    withDeposit: number
    pending: number
    commissionsCount: number
  }
  referredUsers: {
    id: string
    name: string
    email: string
    currency: string
    createdAt: string
    firstDepositAmount: number
    firstDepositAt?: string
    totalDeposited: number
  }[]
  commissions: {
    id: string
    userId: string
    depositAmount: number
    commission: number
    currency: string
    rate: number
    createdAt: string
  }[]
  withdrawals: {
    id: string
    userId: string | null
    userName: string
    amount: number
    currency: string
    status: 'pending' | 'success' | 'failed' | 'cancelled'
    createdAt: string
  }[]
}

export default function SubAdminDashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/sub-admin/me', { cache: 'no-store' })
      if (res.status === 401) {
        router.push('/sub-admin/login?next=/sub-admin/dashboard')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as MeResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    await fetch('/api/sub-admin/logout', { method: 'POST' })
    router.push('/sub-admin/login')
    router.refresh()
  }

  const copy = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Failed to load dashboard: {error}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  const sa = data.subAdmin
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const referralLink = `${origin}/register?ref=${sa.referralCode}`

  // Sum commissions whose createdAt falls in the current local day.
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCommissions: Record<string, number> = {}
  let todayCount = 0
  for (const c of data.commissions) {
    if (new Date(c.createdAt) >= todayStart) {
      todayCommissions[c.currency] = +(((todayCommissions[c.currency] ?? 0) + c.commission)).toFixed(2)
      todayCount++
    }
  }

  // Total successfully withdrawn by referred users, per currency.
  const withdrawnByCurrency: Record<string, number> = {}
  let withdrawnCount = 0
  for (const w of data.withdrawals) {
    if (w.status !== 'success') continue
    withdrawnByCurrency[w.currency] = +(((withdrawnByCurrency[w.currency] ?? 0) + w.amount)).toFixed(2)
    withdrawnCount++
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center" aria-label="Bettivo home">
              <Image
                src="/bettivo-logo.svg"
                alt="Bettivo"
                width={360}
                height={104}
                className="logo-img h-7 w-auto"
              />
            </Link>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5 shrink-0">
              Partner
            </span>
            <span className="text-sm text-foreground truncate hidden sm:inline">
              {sa.name}
            </span>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm" className="gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {!sa.approved && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
            <div className="text-warning">
              Your account is awaiting approval. Referrals already work, but commissions
              won&apos;t be credited until the main admin approves you.
            </div>
          </div>
        )}

        {/* Referral code + link */}
        <section className="bg-card border border-border rounded-xl p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Your referral code
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-mono text-3xl font-bold tracking-widest text-primary">
                  {sa.referralCode}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(sa.referralCode, 'code')}
                  className="h-8 gap-1.5"
                >
                  {copied === 'code' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="text-success">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy code</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Earn <b>65%</b> commission on every deposit from each referred user.
              </p>
            </div>
            <div className="flex-1 lg:max-w-md">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Share this link
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={referralLink}
                  className="flex-1 px-3 py-2 bg-secondary border border-border rounded-md text-xs font-mono truncate"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(referralLink, 'link')}
                  className="h-9 gap-1.5"
                >
                  {copied === 'link' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="hidden sm:inline text-success">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Copy link</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* KPI tiles */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            icon={<Users className="w-4 h-4 text-primary" />}
            label="Referrals"
            value={data.stats.referrals.toString()}
            sub={`${data.stats.withDeposit} with deposit`}
          />
          <Kpi
            icon={<Wallet className="w-4 h-4 text-success" />}
            label="Commission balance"
            value={formatCurrencyMap(sa.commissionBalances)}
            sub="payable now"
            tone="good"
          />
          <Kpi
            icon={<Coins className="w-4 h-4 text-muted-foreground" />}
            label="Today's commission"
            value={formatCurrencyMap(todayCommissions)}
            sub={`${todayCount} deposit${todayCount === 1 ? '' : 's'} today`}
          />
          <Kpi
            icon={<Banknote className="w-4 h-4 text-muted-foreground" />}
            label="Users' withdrawals"
            value={formatCurrencyMap(withdrawnByCurrency)}
            sub={`${withdrawnCount} paid out`}
          />
        </section>

        {/* Referred users table */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold">Referred users ({data.referredUsers.length})</h2>
            <p className="text-xs text-muted-foreground">
              Users who registered with your code. Commission fires on every deposit they make.
            </p>
          </header>
          {data.referredUsers.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No referrals yet. Share your code or link to get started.
            </p>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_180px_120px_120px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
                <span>User</span>
                <span>Signed up</span>
                <span className="text-right">First deposit</span>
                <span className="text-right">Total deposited</span>
                <span className="text-right">Today&apos;s commission</span>
              </div>
              <ul className="divide-y divide-border">
                {data.referredUsers.map((u) => {
                  const userCommissions = data.commissions.filter(
                    (c) => c.userId === u.id && new Date(c.createdAt) >= todayStart,
                  )
                  const totalCommission = userCommissions.reduce((sum, c) => sum + c.commission, 0)
                  const commissionCurrency = userCommissions[0]?.currency ?? u.currency
                  return (
                    <li key={u.id} className="px-4 py-3">
                      <div className="md:grid md:grid-cols-[1fr_180px_120px_120px_120px] md:gap-3 md:items-center flex flex-col gap-1">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {new Date(u.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <div className="md:text-right">
                          {u.firstDepositAt ? (
                            <p className="text-sm font-bold tabular-nums">
                              {u.currency} {formatMoney(u.firstDepositAmount, u.currency)}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pending</span>
                          )}
                        </div>
                        <p className="md:text-right text-sm tabular-nums">
                          {u.currency} {formatMoney(u.totalDeposited, u.currency)}
                        </p>
                        <p
                          className={`md:text-right text-sm font-bold tabular-nums ${
                            userCommissions.length > 0 ? 'text-success' : 'text-muted-foreground'
                          }`}
                        >
                          {userCommissions.length > 0
                            ? `+${commissionCurrency} ${formatMoney(totalCommission, commissionCurrency)}`
                            : '—'}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        {/* Withdrawals by referred users */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Banknote className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <h2 className="font-semibold">Withdrawals ({data.withdrawals.length})</h2>
              <p className="text-xs text-muted-foreground">
                Payouts requested by the users you referred.
              </p>
            </div>
          </header>
          {data.withdrawals.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No withdrawals from your referred users yet.
            </p>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_180px_140px_120px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
                <span>User</span>
                <span>Requested</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
              </div>
              <ul className="divide-y divide-border">
                {data.withdrawals.map((w) => (
                  <li key={w.id} className="px-4 py-3">
                    <div className="md:grid md:grid-cols-[1fr_180px_140px_120px] md:gap-3 md:items-center flex flex-col gap-1">
                      <p className="font-medium text-sm truncate">{w.userName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {new Date(w.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="md:text-right text-sm font-bold tabular-nums">
                        {w.currency} {formatMoney(w.amount, w.currency)}
                      </p>
                      <div className="md:text-right">
                        <StatusBadge status={w.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'success' | 'failed' | 'cancelled' }) {
  const map = {
    success: { label: 'Paid', cls: 'bg-success/10 text-success border-success/20' },
    pending: { label: 'Pending', cls: 'bg-warning/10 text-warning border-warning/20' },
    failed: { label: 'Failed', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
    cancelled: { label: 'Cancelled', cls: 'bg-secondary text-muted-foreground border-border' },
  }[status]
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map.cls}`}>
      {map.label}
    </span>
  )
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? 'text-success'
      : tone === 'bad'
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </p>
        {icon}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
