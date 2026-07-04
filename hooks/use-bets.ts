'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BetSelection, PlacedBet } from '@/lib/types'
import { getUserId } from '@/lib/user-session'

export type { PlacedBet }

interface UseBetsOptions {
  /**
   * When provided, only loads / mutates this user's bets. Defaults to the
   * currently logged-in user from localStorage. Passing 'admin' disables
   * the userId filter (the GET endpoint then requires admin cookie auth).
   */
  scope?: string | 'admin'
}

export function useBets(options: UseBetsOptions = {}) {
  const [bets, setBets] = useState<PlacedBet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Machine-readable code from the last failed request (e.g. 'deposit-required'
  // when the 24h deposit gate blocks a stake), so the UI can react specifically.
  const [errorCode, setErrorCode] = useState<string | null>(null)
  // Same value, but written synchronously so a caller can read it on the exact
  // line after `await placeBet(...)` without waiting for a state re-render.
  const lastErrorCodeRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const userId = options.scope === 'admin' ? null : (options.scope ?? getUserId())
      const url = userId ? `/api/bets?userId=${encodeURIComponent(userId)}` : '/api/bets'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { bets: PlacedBet[] }
      setBets(data.bets)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [options.scope])

  const placeBet = useCallback(
    async (selections: BetSelection[], stake: number): Promise<PlacedBet | null> => {
      setLoading(true)
      setError(null)
      setErrorCode(null)
      lastErrorCodeRef.current = null
      try {
        const userId = options.scope && options.scope !== 'admin' ? options.scope : getUserId()
        const res = await fetch('/api/bets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ selections, stake, userId }),
        })
        const data = await res.json()
        if (!res.ok) {
          const code = typeof data.code === 'string' ? data.code : null
          lastErrorCodeRef.current = code
          setErrorCode(code)
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        const bet = data.bet as PlacedBet
        setBets((prev) => [bet, ...prev])
        return bet
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return null
      } finally {
        setLoading(false)
      }
    },
    [options.scope],
  )

  const settleBet = useCallback(
    async (id: string, status: 'won' | 'lost'): Promise<PlacedBet | null> => {
      setError(null)
      try {
        const res = await fetch(`/api/bets/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        const updated = data.bet as PlacedBet
        setBets((prev) => prev.map((b) => (b.id === id ? updated : b)))
        return updated
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return null
      }
    },
    [],
  )

  const lookupCode = useCallback(async (code: string): Promise<PlacedBet | null> => {
    setError(null)
    try {
      const res = await fetch(`/api/bets?code=${encodeURIComponent(code)}`, {
        cache: 'no-store',
      })
      if (res.status === 404) {
        setError('No bet found with that code.')
        return null
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { bet: PlacedBet }
      return data.bet
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [])

  const removeBet = useCallback(async (id: string): Promise<boolean> => {
    setError(null)
    try {
      const res = await fetch(`/api/bets/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setBets((prev) => prev.filter((b) => b.id !== id))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll every 30s so the player notices when admin settles their bet.
  // Admin uses scope:'admin' and likely doesn't need the live polling,
  // so we skip it for that caller.
  useEffect(() => {
    if (options.scope === 'admin') return
    const t = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(t)
  }, [options.scope, refresh])

  return { bets, loading, error, errorCode, lastErrorCodeRef, refresh, placeBet, settleBet, removeBet, lookupCode }
}
