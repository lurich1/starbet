'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Trophy,
  XCircle,
} from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'

type TransactionKind =
  | 'deposit'
  | 'withdrawal'
  | 'bet-placed'
  | 'bet-won'
  | 'bet-lost'

interface TransactionItem {
  id: string
  kind: TransactionKind
  amount: number
  currency?: string
  status: 'pending' | 'success' | 'failed' | 'cancelled'
  createdAt: string
  reference?: string
  description: string
  meta?: Record<string, unknown>
}

interface ApiResponse {
  user: {
    id: string
    name: string
    currency?: string
    balance: number
    totalDeposited: number
    totalWithdrawn: number
  }
  transactions: TransactionItem[]
}

type Filter = 'all' | 'deposits' | 'withdrawals' | 'bets'

export default function TransactionsPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    const userId = getUserId()
    if (!userId) {
      setError('You need to sign in to view your transactions.')
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/users/${userId}/transactions`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = (data?.transactions ?? []).filter((t) => {
    if (filter === 'all') return true
    if (filter === 'deposits') return t.kind === 'deposit'
    if (filter === 'withdrawals') return t.kind === 'withdrawal'
    return t.kind === 'bet-placed' || t.kind === 'bet-won' || t.kind === 'bet-lost'
  })

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 xl:pb-0 max-w-lg mx-auto w-full">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="px-3 sm:px-4 h-14 flex items-center gap-3">
          <Link
            href="/me"
            aria-label="Back"
            className="p-2 -ml-2 rounded-md hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-bold text-lg flex-1 truncate">Transaction History</h1>
        </div>
      </header>

      {loading ? (
        <div className="px-3 sm:px-4 pt-4 space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-12 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-14 rounded-full" />
          </div>
          <div className="space-y-2 pt-1">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      ) : error ? (
        <div className="m-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive shadow-card">
          {error}
        </div>
      ) : (
        <>
          {data && (
            <section className="px-3 sm:px-4 pt-4">
              <div className="rounded-2xl bg-gradient-to-br from-card via-card to-secondary/30 border border-border shadow-card overflow-hidden">
                <div aria-hidden className="absolute right-0 top-0 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="relative p-4 grid grid-cols-3 gap-3 text-center">
                  <Summary
                    label="Balance"
                    value={`${data.user.currency ?? 'GHS'} ${formatMoney(data.user.balance, data.user.currency)}`}
                  />
                  <Summary
                    label="Deposited"
                    value={`${data.user.currency ?? 'GHS'} ${formatMoney(data.user.totalDeposited, data.user.currency)}`}
                  />
                  <Summary
                    label="Withdrawn"
                    value={`${data.user.currency ?? 'GHS'} ${formatMoney(data.user.totalWithdrawn, data.user.currency)}`}
                  />
                </div>
              </div>
            </section>
          )}

          <div className="px-3 sm:px-4 pt-4 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {(['all', 'deposits', 'withdrawals', 'bets'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap capitalize transition-all ${
                  filter === f
                    ? 'bg-primary text-primary-foreground shadow-card'
                    : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <main className="flex-1 px-3 sm:px-4 pt-3">
            {filtered.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
                <Receipt className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-semibold text-sm text-foreground">No transactions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Deposits, withdrawals, and bets will show up here.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
            )}
          </main>
        </>
      )}

      <MobileNav selectedBets={[]} activeTab="me" />
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-eyebrow text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-bold tabular-nums mt-1 truncate">{value}</p>
    </div>
  )
}

function TransactionRow({ tx }: { tx: TransactionItem }) {
  const isCredit = tx.amount > 0
  const isZero = tx.amount === 0
  const sign = isZero ? '' : isCredit ? '+' : ''
  const amountColor = isZero
    ? 'text-muted-foreground'
    : isCredit
      ? 'text-success'
      : 'text-destructive'

  const icon = (() => {
    switch (tx.kind) {
      case 'deposit':
        return <ArrowDownLeft className="w-4 h-4 text-success" />
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4 text-amber-500" />
      case 'bet-placed':
        return <Receipt className="w-4 h-4 text-muted-foreground" />
      case 'bet-won':
        return <Trophy className="w-4 h-4 text-success" />
      case 'bet-lost':
        return <XCircle className="w-4 h-4 text-destructive" />
    }
  })()

  const statusBadge =
    tx.status === 'pending'
      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
      : tx.status === 'failed' || tx.status === 'cancelled'
        ? 'bg-destructive/15 text-destructive border-destructive/30'
        : null

  return (
    <li className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 shadow-card lift-on-hover">
      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{tx.description}</p>
        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
          <span>{new Date(tx.createdAt).toLocaleString()}</span>
          {tx.reference && (
            <span className="font-mono opacity-70">· {tx.reference.slice(0, 16)}</span>
          )}
          {statusBadge && (
            <span
              className={`px-1.5 py-0.5 rounded-full border text-[9px] uppercase font-bold ${statusBadge}`}
            >
              {tx.status}
            </span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`font-bold tabular-nums ${amountColor}`}>
          {isZero ? '—' : `${sign}${formatMoney(tx.amount, tx.currency)}`}
        </p>
        <p className="text-[10px] text-muted-foreground">{tx.currency ?? 'GHS'}</p>
      </div>
    </li>
  )
}
