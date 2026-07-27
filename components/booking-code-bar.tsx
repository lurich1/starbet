'use client'

import { useState } from 'react'
import { Loader2, Ticket } from 'lucide-react'
import type { BetSelection, PlacedBet } from '@/lib/types'

// Home "Paste any booking code" bar. Loads a shared booking/bet code
// (GET /api/bets?code=) straight into the current slip.
export function BookingCodeBar({
  onLoad,
}: {
  onLoad?: (selections: BetSelection[]) => void
}) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    setMsg(null)
    const c = code.trim().toUpperCase()
    if (c.length < 4) {
      setMsg({ ok: false, text: 'Enter a valid booking code.' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/bets?code=${encodeURIComponent(c)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setMsg({ ok: false, text: 'No slip found for that code.' })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { bet: PlacedBet }
      const sels = data.bet?.selections ?? []
      if (!sels.length) {
        setMsg({ ok: false, text: 'That code has no selections.' })
        return
      }
      onLoad?.(sels)
      setCode('')
      setMsg({ ok: true, text: `Loaded ${sels.length} selection${sels.length > 1 ? 's' : ''} into your slip.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not load that code.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="booking" className="scroll-mt-20">
      <div className="flex items-stretch gap-2 rounded-2xl bg-card border border-border p-1.5 shadow-sm">
        <div className="relative flex-1 min-w-0">
          <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Paste any booking code"
            className="w-full h-10 bg-transparent pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none uppercase tracking-wide"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-105 active:scale-[0.98] transition disabled:opacity-60 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Load Code
        </button>
      </div>
      {msg && (
        <p className={`mt-1.5 px-1 text-xs font-medium ${msg.ok ? 'text-primary' : 'text-destructive'}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
