'use client'

import { useEffect, useState } from 'react'
import {
  Loader2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SubAdminRow {
  id: string
  name: string
  email: string
  referralCode: string
  approved: boolean
  createdAt: string
  commissionBalance: number
  totalCommissionEarned: number
  referrals: number
  withDeposit: number
  commissionsCount: number
}

export default function AdminSubAdminsPage() {
  const [rows, setRows] = useState<SubAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/sub-admins', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { subAdmins: SubAdminRow[] }
      setRows(data.subAdmins)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.referralCode.toLowerCase().includes(q)
    )
  })

  const setBusyFor = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const handleToggleApprove = async (row: SubAdminRow) => {
    setBusyFor(row.id, true)
    try {
      const res = await fetch(`/api/admin/sub-admins/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: !row.approved }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, approved: !row.approved } : r)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyFor(row.id, false)
    }
  }

  const handleDelete = async (row: SubAdminRow) => {
    if (
      !confirm(
        `Delete sub-admin "${row.name}"? Their referral code will no longer work but past referrals stay in the user table.`,
      )
    ) {
      return
    }
    setBusyFor(row.id, true)
    try {
      const res = await fetch(`/api/admin/sub-admins/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyFor(row.id, false)
    }
  }

  const totals = rows.reduce(
    (acc, r) => ({
      referrals: acc.referrals + r.referrals,
      deposits: acc.deposits + r.withDeposit,
      paid: acc.paid + r.totalCommissionEarned,
    }),
    { referrals: 0, deposits: 0, paid: 0 },
  )

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Sub-admins (Partners)</h1>
        <p className="text-sm text-muted-foreground">
          Partners self-register at{' '}
          <code className="font-mono text-xs">/sub-admin/register</code>. They earn 60% on
          every deposit from each referred user.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Partners" value={rows.length.toString()} />
        <Tile label="Approved" value={rows.filter((r) => r.approved).length.toString()} />
        <Tile label="Referred users" value={totals.referrals.toString()} />
        <Tile label="Total commissions" value={totals.paid.toFixed(2)} />
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or code…"
            className="pl-10 bg-card border-border"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 text-sm">
          {rows.length === 0
            ? 'No partners yet. Share /sub-admin/register to start signing them up.'
            : 'No partners match the current search.'}
        </p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_100px_100px_100px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/40">
            <span>Partner</span>
            <span>Code</span>
            <span className="text-right">Refs</span>
            <span className="text-right">Deps</span>
            <span className="text-right">Balance</span>
            <span className="text-right">All time</span>
            <span>Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="md:grid md:grid-cols-[1fr_100px_80px_80px_100px_100px_100px] md:gap-3 md:items-center flex flex-col gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{r.name}</p>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                          r.approved
                            ? 'bg-success/15 text-success border-success/30'
                            : 'bg-warning/15 text-warning border-warning/30'
                        }`}
                      >
                        {r.approved ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                  </div>
                  <p className="font-mono text-xs tracking-wider text-primary">
                    {r.referralCode}
                  </p>
                  <p className="md:text-right text-sm tabular-nums">
                    <span className="md:hidden text-muted-foreground text-xs mr-1">Refs:</span>
                    {r.referrals}
                  </p>
                  <p className="md:text-right text-sm tabular-nums">
                    <span className="md:hidden text-muted-foreground text-xs mr-1">Deps:</span>
                    {r.withDeposit}
                  </p>
                  <p className="md:text-right text-sm font-semibold tabular-nums text-success">
                    <span className="md:hidden text-muted-foreground text-xs mr-1">Bal:</span>
                    {r.commissionBalance.toFixed(2)}
                  </p>
                  <p className="md:text-right text-sm tabular-nums">
                    <span className="md:hidden text-muted-foreground text-xs mr-1">Earned:</span>
                    {r.totalCommissionEarned.toFixed(2)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleApprove(r)}
                      disabled={busy.has(r.id)}
                      className="h-7 px-2 text-xs gap-1"
                      title={r.approved ? 'Disable' : 'Enable'}
                    >
                      {r.approved ? (
                        <ToggleRight className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(r)}
                      disabled={busy.has(r.id)}
                      className="h-7 px-2 text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      {busy.has(r.id) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  )
}
