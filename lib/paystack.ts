// Server-side Paystack helpers. Never import in client code — the secret
// key would leak into the bundle. For the browser, use
// NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY.

const PAYSTACK_API_BASE = 'https://api.paystack.co'

export interface PaystackTransaction {
  reference: string
  /** Amount Paystack received, in the smallest currency unit (pesewas). */
  amount: number
  currency: string
  status: 'success' | 'failed' | 'abandoned' | 'pending' | 'reversed' | string
  customer?: { email?: string; name?: string }
  metadata?: Record<string, unknown>
}

export interface VerifyResult {
  ok: boolean
  status?: string
  /** Amount in the major unit (GHS), converted from pesewas Paystack returns. */
  amount?: number
  currency?: string
  reference?: string
  metadata?: Record<string, unknown>
  error?: string
}

/**
 * Verify a Paystack transaction by reference using the secret key.
 * Always do this server-side before crediting a user — never trust the
 * inline checkout's success callback by itself.
 */
export async function verifyPaystackCharge(reference: string): Promise<VerifyResult> {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) {
    return { ok: false, error: 'PAYSTACK_SECRET_KEY not configured' }
  }
  if (!reference) {
    return { ok: false, error: 'reference required' }
  }

  try {
    const res = await fetch(
      `${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      },
    )
    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean
      message?: string
      data?: PaystackTransaction
    }
    if (!res.ok || !json.status || !json.data) {
      return { ok: false, error: json.message ?? `HTTP ${res.status}` }
    }
    const data = json.data
    return {
      ok: data.status === 'success',
      status: data.status,
      // Paystack returns pesewas — convert to major unit so the caller
      // can compare against the GHS amount it expected.
      amount: typeof data.amount === 'number' ? data.amount / 100 : undefined,
      currency: data.currency,
      reference: data.reference,
      metadata: data.metadata,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getMinFirstDeposit(): number {
  const raw = process.env.MIN_FIRST_DEPOSIT
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 200
}
