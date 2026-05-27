'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  Loader2,
  CircleAlert,
  RefreshCw,
  TrendingUp,
  Users,
  Receipt,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format-money'

interface DepositRow {
  id: string
  reference: string
  amount: number
  currency: string
  provider: string
  status: 'pending' | 'success' | 'failed' | 'cancelled'
  source: string | null
  note: string | null
  failureReason: string | null
  paidAmount: number | null
  adminResolved: boolean
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    phone: string | null
    totalDeposited: number
    balance: number
  } | null
}

interface UserRollup {
  userId: string
  name: string
  email: string
  depositCount: number
  depositTotal: number
  lastDepositAt: string
  balance: number
}

interface DepositsResponse {
  deposits: DepositRow[]
  userRollup: UserRollup[]
  totals: { successCount: number; successAmount: number }
}

type View = 'users' | 'transactions'
type StatusFilter = 'all' | 'success' | 'failed' | 'pending'

export default function AdminDepositsPage() {
  const [data, setData] = useState<DepositsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('users')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/deposits', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as DepositsResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredDeposits = useMemo(() => {
    if (!data) return [] as DepositRow[]
    const q = search.trim().toLowerCase()
    return data.deposits.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (!q) return true
      return (
        d.reference.toLowerCase().includes(q) ||
        d.provider.toLowerCase().includes(q) ||
        (d.user?.name.toLowerCase().includes(q) ?? false) ||
        (d.user?.email.toLowerCase().includes(q) ?? false) ||
        (d.user?.phone?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [data, search, statusFilter])

  const statusCounts = useMemo(() => {
    if (!data) return { all: 0, success: 0, failed: 0, pending: 0 }
    return data.deposits.reduce(
      (acc, d) => {
        acc.all += 1
        if (d.status === 'success') acc.success += 1
        else if (d.status === 'failed' || d.status === 'cancelled') acc.failed += 1
        else if (d.status === 'pending') acc.pending += 1
        return acc
      },
      { all: 0, success: 0, failed: 0, pending: 0 },
    )
  }, [data])

  const resolvePayment = async (paymentId: string, userName: string, amount: number) => {
    if (
      !confirm(
        `Credit ${userName} GHS ${formatMoney(amount)} and mark this Moolre attempt as resolved?\n\nMake sure the user actually paid — this cannot be undone here.`,
      )
    ) {
      return
    }
    setResolvingId(paymentId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setResolvingId(null)
    }
  }

  const filteredRollup = useMemo(() => {
    if (!data) return [] as UserRollup[]
    const q = search.trim().toLowerCase()
    if (!q) return data.userRollup
    return data.userRollup.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q),
    )
  }, [data, search])

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Deposits</h1>
          <p className="text-sm text-muted-foreground">
            All player deposits — Moolre top-ups and admin credits. Newest
            first.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true)
            void load()
          }}
          disabled={loading}
          className="h-9 text-xs"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
          <CircleAlert className="w-4 h-4" /> {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Kpi
            icon={<TrendingUp className="w-4 h-4 text-success" />}
            label="Total deposited"
            value={`GHS ${formatMoney(data.totals.successAmount)}`}
          />
          <Kpi
            icon={<Receipt className="w-4 h-4 text-primary" />}
            label="Successful deposits"
            value={data.totals.successCount.toString()}
          />
          <Kpi
            icon={<Users className="w-4 h-4 text-primary" />}
            label="Depositors"
            value={data.userRollup.length.toString()}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-full bg-secondary p-0.5">
          <ViewPill
            active={view === 'users'}
            onClick={() => setView('users')}
            label="Depositors"
          />
          <ViewPill
            active={view === 'transactions'}
            onClick={() => setView('transactions')}
            label="Transactions"
          />
        </div>
        <div className="ml-auto relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={
              view === 'users'
                ? 'Search name, email, ID'
                : 'Search reference, provider, user'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {view === 'transactions' && (
        <div className="flex flex-wrap gap-2">
          <StatusPill
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            label={`All (${statusCounts.all})`}
          />
          <StatusPill
            active={statusFilter === 'success'}
            onClick={() => setStatusFilter('success')}
            label={`Verified (${statusCounts.success})`}
          />
          <StatusPill
            active={statusFilter === 'failed'}
            onClick={() => setStatusFilter('failed')}
            label={`Failed (${statusCounts.failed})`}
            tone="bad"
          />
          <StatusPill
            active={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
            label={`Pending (${statusCounts.pending})`}
            tone="warn"
          />
        </div>
      )}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-4 py-10 text-center text-muted-foreground flex items-center justify-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading deposits…
          </div>
        ) : view === 'users' ? (
          filteredRollup.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground text-sm">
              No depositors match this filter.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredRollup.map((u) => (
                <li
                  key={u.userId}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                      Last deposit: {formatDate(u.lastDepositAt)} · Balance: GHS{' '}
                      {formatMoney(u.balance)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">
                      GHS {formatMoney(u.depositTotal)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {u.depositCount} deposit{u.depositCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : filteredDeposits.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted-foreground text-sm">
            No transactions match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredDeposits.map((d) => {
              const isFailed = d.status === 'failed' || d.status === 'cancelled'
              const isPending = d.status === 'pending'
              const canResolve = (isFailed || isPending) && d.user
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 text-xs flex-wrap">
                        <StatusBadge status={d.status} />
                        <SourceBadge source={d.source} provider={d.provider} />
                        <span className="font-mono text-[10px] text-muted-foreground truncate">
                          {d.reference}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        {d.user ? d.user.name : 'Unknown user'}
                        {d.user && (
                          <span className="text-muted-foreground font-normal">
                            {' · '}
                            {d.user.email}
                          </span>
                        )}
                        {d.user?.phone && (
                          <span className="text-muted-foreground font-normal">
                            {' · '}
                            {d.user.phone}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(d.createdAt)}
                        {d.note ? ` · ${d.note}` : ''}
                      </p>
                      <FailureReason metadata={d} />
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div>
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            isFailed
                              ? 'text-destructive'
                              : isPending
                                ? 'text-amber-600'
                                : 'text-success'
                          }`}
                        >
                          {isFailed ? '✕' : isPending ? '…' : '+'} GHS{' '}
                          {formatMoney(d.amount)}
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground">
                          {d.currency}
                        </p>
                      </div>
                      {canResolve && (
                        <Button
                          size="sm"
                          onClick={() =>
                            resolvePayment(d.id, d.user!.name, d.amount)
                          }
                          disabled={resolvingId === d.id}
                          className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                          title="Credit user this amount and mark this Moolre attempt as resolved"
                        >
                          {resolvingId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Credit &amp; resolve
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </p>
        {icon}
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function ViewPill({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-secondary/80'
      }`}
    >
      {label}
    </button>
  )
}

function StatusPill({
  active,
  onClick,
  label,
  tone = 'neutral',
}: {
  active: boolean
  onClick: () => void
  label: string
  tone?: 'neutral' | 'bad' | 'warn'
}) {
  const activeCls =
    tone === 'bad'
      ? 'bg-destructive text-destructive-foreground'
      : tone === 'warn'
        ? 'bg-amber-500 text-white'
        : 'bg-primary text-primary-foreground'
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? activeCls : 'bg-secondary text-foreground hover:bg-secondary/80'
      }`}
    >
      {label}
    </button>
  )
}

function FailureReason({ metadata }: { metadata: DepositRow }) {
  if (metadata.adminResolved) {
    return (
      <p className="text-[11px] text-success mt-0.5 flex items-center gap-1">
        <Check className="w-3 h-3" /> Resolved by admin
      </p>
    )
  }
  if (!metadata.failureReason) return null
  return (
    <p className="text-[11px] text-destructive mt-0.5 flex items-center gap-1">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      <span className="truncate">
        {metadata.failureReason}
        {metadata.paidAmount != null
          ? ` (paid GHS ${formatMoney(metadata.paidAmount)})`
          : ''}
      </span>
    </p>
  )
}

function StatusBadge({ status }: { status: DepositRow['status'] }) {
  const cls =
    status === 'success'
      ? 'bg-success/15 text-success border-success/30'
      : status === 'pending'
        ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
        : 'bg-destructive/15 text-destructive border-destructive/30'
  return (
    <span
      className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold uppercase ${cls}`}
    >
      {status}
    </span>
  )
}

function SourceBadge({
  source,
  provider,
}: {
  source: string | null
  provider: string
}) {
  if (source === 'admin_credit') {
    return (
      <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase border-primary/30 text-primary bg-primary/10">
        Admin credit
      </span>
    )
  }
  return (
    <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase border-border text-muted-foreground">
      {provider}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
