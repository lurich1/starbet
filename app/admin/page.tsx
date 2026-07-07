'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Receipt,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import { formatMoney } from '@/lib/format-money'
import { Skeleton } from '@/components/ui/skeleton'

interface StatsResponse {
  counts: { total: number; open: number; won: number; lost: number; users: number }
  money: {
    totalStake: number
    openStake: number
    settledStake: number
    totalReturns: number
    netPL: number
    depositsByCurrency: Record<string, number>
    withdrawalsByCurrency: Record<string, number>
    stakesByCurrency: Record<string, number>
    returnsByCurrency: Record<string, number>
  }
  winRate: number
  byDay: { date: string; count: number; stake: number }[]
  topLeagues: { league: string; picks: number }[]
  recent: {
    id: string
    code: string
    placedAt: string
    settledAt?: string
    status: 'pending' | 'won' | 'lost'
    stake: number
    totalOdds: number
    potentialWin: number
    payout?: number
    selectionCount: number
    firstMatch: string
  }[]
}

interface WithdrawalRow {
  id: string
  reference: string
  amount: number
  currency: string
  status: 'pending' | 'success' | 'failed' | 'cancelled'
  createdAt: string
  user: { id: string; name: string; email: string } | null
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [statsRes, wdRes] = await Promise.all([
          fetch('/api/admin/stats', { cache: 'no-store' }),
          fetch('/api/admin/deposits?type=withdrawal', { cache: 'no-store' }),
        ])
        if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`)
        const data = (await statsRes.json()) as StatsResponse
        if (!cancelled) setStats(data)
        if (wdRes.ok) {
          const wd = (await wdRes.json()) as { payments?: WithdrawalRow[] }
          if (!cancelled) setWithdrawals(wd.payments ?? [])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    const t = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Failed to load stats: {error}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  const maxDayCount = Math.max(1, ...stats.byDay.map((d) => d.count))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-title font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Live stats from Supabase. Refreshes every 15s.
        </p>
      </div>

      {/* KPI cards — counts only; money totals get a per-currency panel below */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Users"
          value={stats.counts.users.toString()}
          icon={<TrendingUp className="w-4 h-4 text-success" />}
        />
        <Kpi label="Total bets" value={stats.counts.total.toString()} />
        <Kpi label="Open" value={stats.counts.open.toString()} />
        <Kpi label="Settled" value={(stats.counts.won + stats.counts.lost).toString()} />
      </div>

      {/* Money by currency — one row per wallet currency */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <h2 className="font-semibold mb-3 flex items-center gap-2 text-title">
          Money by currency
        </h2>
        <CurrencyTable
          deposits={stats.money.depositsByCurrency}
          withdrawals={stats.money.withdrawalsByCurrency}
          stakes={stats.money.stakesByCurrency}
          returns={stats.money.returnsByCurrency}
        />
      </div>

      {/* Recent withdrawals */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-title">Recent withdrawals</h2>
          <Link
            href="/admin/deposits"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            All payments <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {withdrawals.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No withdrawals yet.</p>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_160px_140px_110px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
              <span>User</span>
              <span>Requested</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
            </div>
            <ul className="divide-y divide-border">
              {withdrawals.slice(0, 10).map((w) => (
                <li key={w.id} className="px-4 py-3">
                  <div className="md:grid md:grid-cols-[1fr_160px_140px_110px] md:gap-3 md:items-center flex flex-col gap-1">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{w.user?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{w.user?.email ?? ''}</p>
                    </div>
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
                      <WithdrawalStatus status={w.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Chart + Top leagues */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-title">Bets — last 7 days</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              Total: {stats.byDay.reduce((s, d) => s + d.count, 0)}
            </span>
          </div>
          <div className="flex items-end gap-2 h-40">
            {stats.byDay.map((d) => {
              const heightPct = (d.count / maxDayCount) * 100
              const label = new Date(d.date + 'T00:00:00Z').toLocaleDateString(undefined, {
                weekday: 'short',
              })
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={`w-full rounded-t ${
                        d.count > 0 ? 'bg-primary' : 'bg-secondary'
                      }`}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      title={`${d.date}: ${d.count} bets, ${d.stake.toFixed(2)} staked`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                  <span className="text-xs font-bold tabular-nums">{d.count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-card">
          <h2 className="font-semibold mb-4 text-title">Top picks by league</h2>
          {stats.topLeagues.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">No bets yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {stats.topLeagues.map((l) => (
                <li
                  key={l.league}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors text-sm"
                >
                  <span className="truncate text-foreground">{l.league}</span>
                  <span className="font-bold tabular-nums shrink-0 text-primary">{l.picks}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-card border border-border rounded-xl shadow-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-title">Recent activity</h2>
          </div>
          <Link
            href="/admin/bets"
            className="text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {stats.recent.length === 0 ? (
          <div className="m-4 bg-card border border-dashed border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No bets yet. Place one on the home page to see it here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {stats.recent.map((b) => (
              <li key={b.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-secondary/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full border font-bold uppercase ${
                        b.status === 'won'
                          ? 'bg-success/15 text-success border-success/30'
                          : b.status === 'lost'
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {b.status}
                    </span>
                    <span className="font-mono tracking-wider text-primary">{b.code}</span>
                    <span>·</span>
                    <span>
                      {new Date(b.placedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">
                    {b.firstMatch}
                    {b.selectionCount > 1 ? ` (+${b.selectionCount - 1} more)` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{b.stake.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    @ {b.totalOdds.toFixed(2)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CurrencyTable({
  deposits,
  withdrawals,
  stakes,
  returns: returnsBy,
}: {
  deposits: Record<string, number>
  withdrawals: Record<string, number>
  stakes: Record<string, number>
  returns: Record<string, number>
}) {
  const currencies = Array.from(
    new Set([
      ...Object.keys(deposits),
      ...Object.keys(withdrawals),
      ...Object.keys(stakes),
      ...Object.keys(returnsBy),
    ]),
  ).sort()
  if (currencies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-semibold py-1">Currency</th>
            <th className="text-right font-semibold py-1">Deposits</th>
            <th className="text-right font-semibold py-1">Withdrawals</th>
            <th className="text-right font-semibold py-1">Stakes</th>
            <th className="text-right font-semibold py-1">Returns</th>
          </tr>
        </thead>
        <tbody>
          {currencies.map((cur) => (
            <tr key={cur} className="border-t border-border">
              <td className="py-1.5 font-semibold">{cur}</td>
              <td className="py-1.5 text-right tabular-nums text-success">
                {formatMoney(deposits[cur] ?? 0, cur)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-destructive">
                {formatMoney(withdrawals[cur] ?? 0, cur)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatMoney(stakes[cur] ?? 0, cur)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatMoney(returnsBy[cur] ?? 0, cur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad' | 'neutral'
  icon?: React.ReactNode
}) {
  const color =
    tone === 'good'
      ? 'text-success'
      : tone === 'bad'
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-card lift-on-hover">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-eyebrow text-muted-foreground">{label}</p>
        {icon && (
          <span className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
            {icon}
          </span>
        )}
      </div>
      <p className={`text-2xl font-extrabold tabular-nums tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function WithdrawalStatus({ status }: { status: 'pending' | 'success' | 'failed' | 'cancelled' }) {
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
