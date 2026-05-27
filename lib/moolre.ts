// Server-side Moolre helpers. Never import in client code — the public/private
// keys are merchant secrets despite the naming.
//
// API contract derived from Moolre's open-source WooCommerce plugin
// (https://wordpress.org/plugins/moolre-payment-gateway/). The hosted-checkout
// endpoint is a single URL whose behavior depends on the `state` field:
//   - state=starter  → create a payment, get back an authorization_url
//   - state=confirm  → verify a payment by reference
//
// Auth is `X-Api-Pubkey: <MOOLRE_PUBLIC_KEY>`; the merchant's `accountnumber`
// is also in the body. Both must be set in env or every call returns an error.

const MOOLRE_API_URL = 'https://api.moolre.com/embed/src/start'

export interface MoolreStartInput {
  reference: string
  email: string
  amount: number
  currency?: string
  callbackUrl: string
}

export interface MoolreStartResult {
  ok: boolean
  /** URL to redirect the customer to so they can pay on Moolre's hosted page. */
  url?: string
  error?: string
}

export interface MoolreVerifyResult {
  ok: boolean
  /** Moolre's numeric status code (1 = success). */
  status?: number
  amount?: number
  currency?: string
  reference?: string
  raw?: Record<string, unknown>
  error?: string
}

function requireConfig(): { pubKey: string; account: string } | { error: string } {
  const pubKey = process.env.MOOLRE_PUBLIC_KEY
  const account = process.env.MOOLRE_ACCOUNT_NUMBER
  if (!pubKey) return { error: 'MOOLRE_PUBLIC_KEY not configured' }
  if (!account) return { error: 'MOOLRE_ACCOUNT_NUMBER not configured' }
  return { pubKey, account }
}

/**
 * Create a Moolre payment and return the URL to redirect the customer to.
 * The customer pays on Moolre's hosted page (MTN, Telecel, AT Money), then
 * Moolre redirects them back to `callbackUrl` with `?reference=<ref>`.
 */
export async function startMoolrePayment(
  input: MoolreStartInput,
): Promise<MoolreStartResult> {
  const cfg = requireConfig()
  if ('error' in cfg) return { ok: false, error: cfg.error }
  if (!input.reference) return { ok: false, error: 'reference required' }
  if (!input.email) return { ok: false, error: 'email required' }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'amount must be > 0' }
  }
  if (!input.callbackUrl) return { ok: false, error: 'callbackUrl required' }

  try {
    const res = await fetch(MOOLRE_API_URL, {
      method: 'POST',
      headers: {
        'X-Api-Pubkey': cfg.pubKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: 'starter',
        accountnumber: cfg.account,
        reference: input.reference,
        email: input.email,
        amount: input.amount,
        currency: input.currency ?? 'GHS',
        callback: input.callbackUrl,
        tx_source: 'primebet-web',
      }),
      cache: 'no-store',
    })
    const raw = await res.text()
    let json: {
      status?: number | boolean
      message?: string
      data?: { authorization_url?: string }
    } = {}
    try {
      json = raw ? JSON.parse(raw) : {}
    } catch {
      // Non-JSON response (HTML error page, etc.) — fall through.
    }
    if (!res.ok || !json.data?.authorization_url) {
      // Log the full Moolre response server-side so we can see exactly
      // what they rejected — the client only gets the short error.
      console.error('[moolre.start] failed', {
        httpStatus: res.status,
        moolreStatus: json.status,
        moolreMessage: json.message,
        accountnumberLen: cfg.account.length,
        pubKeyPrefix: cfg.pubKey.slice(0, 8),
        rawSnippet: raw.slice(0, 300),
      })
      return {
        ok: false,
        error:
          json.message ??
          (json.data?.authorization_url
            ? `HTTP ${res.status}`
            : 'no authorization_url in response'),
      }
    }
    return { ok: true, url: json.data.authorization_url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Verify a Moolre payment by reference. Returns `ok: true` only when Moolre
 * reports `data.status === 1`. Always do this server-side before crediting —
 * never trust the callback query string alone.
 */
export async function verifyMoolrePayment(
  reference: string,
): Promise<MoolreVerifyResult> {
  const cfg = requireConfig()
  if ('error' in cfg) return { ok: false, error: cfg.error }
  if (!reference) return { ok: false, error: 'reference required' }

  try {
    const res = await fetch(MOOLRE_API_URL, {
      method: 'POST',
      headers: {
        'X-Api-Pubkey': cfg.pubKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: 'confirm',
        accountnumber: cfg.account,
        reference,
      }),
      cache: 'no-store',
    })
    const raw = await res.text()
    let json: {
      status?: number | boolean
      message?: string
      data?: {
        status?: number
        amount?: number | string
        currency?: string
        reference?: string
      }
    } = {}
    try {
      json = raw ? JSON.parse(raw) : {}
    } catch {
      // ignore non-JSON
    }
    if (!res.ok || !json.data) {
      console.error('[moolre.verify] failed', {
        httpStatus: res.status,
        moolreStatus: json.status,
        moolreMessage: json.message,
        reference,
        rawSnippet: raw.slice(0, 300),
      })
      return { ok: false, error: json.message ?? `HTTP ${res.status}` }
    }
    const data = json.data
    const amount =
      typeof data.amount === 'string' ? Number(data.amount) : data.amount
    return {
      ok: data.status === 1,
      status: typeof data.status === 'number' ? data.status : undefined,
      amount: typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined,
      currency: data.currency,
      reference: data.reference ?? reference,
      raw: data as Record<string, unknown>,
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
