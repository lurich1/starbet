// Flutterwave V4 integration — covers Ghana (GHS) & Kenya (KES) via mobile
// money and Nigeria (NGN) / South Africa (ZAR) via bank transfer.
//
// V4 is OAuth-secured (no static secret key like v3/Paystack):
//   1. Exchange CLIENT_ID + CLIENT_SECRET for a short-lived access token at the
//      identity provider (valid ~10 min — we cache it in-memory per instance).
//   2. POST a charge to {BASE}/orchestration/direct-charges with the access
//      token + a unique X-Trace-Id and X-Idempotency-Key. The response carries
//      a `next_action` telling us how the customer finishes paying — usually a
//      `redirect_url` we send them to (mobile money approval / bank page).
//   3. After the customer returns, confirm by GET {BASE}/charges/{id} and check
//      `status === 'succeeded'`.
//
// Amounts in V4 are plain decimal MAJOR units (e.g. 50.00 GHS), not the minor
// units Paystack used — so no ×100 conversion here.

import type { CountryCode, CurrencyCode } from '@/lib/countries'

const TOKEN_URL =
  process.env.FLUTTERWAVE_TOKEN_URL?.trim() ||
  'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token'

// Live base is https://api.flutterwave.cloud/f4b; sandbox is
// https://api.flutterwave.cloud/developersandbox. Override per environment.
function baseUrl(): string {
  return (
    process.env.FLUTTERWAVE_BASE_URL?.trim().replace(/\/$/, '') ||
    'https://api.flutterwave.cloud/f4b'
  )
}

function getClientId(): string {
  const v = process.env.FLUTTERWAVE_CLIENT_ID?.trim()
  if (!v) throw new Error('FLUTTERWAVE_CLIENT_ID is not configured')
  return v
}

function getClientSecret(): string {
  const v = process.env.FLUTTERWAVE_CLIENT_SECRET?.trim()
  if (!v) throw new Error('FLUTTERWAVE_CLIENT_SECRET is not configured')
  return v
}

// ---- Access-token cache (per serverless instance) -------------------------

let cachedToken: { value: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  // Reuse while >30s of life remains.
  if (cachedToken && cachedToken.expiresAt - Date.now() > 30_000) {
    return cachedToken.value
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Flutterwave auth failed: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`,
    )
  }
  const ttlMs = (body.expires_in ?? 600) * 1000
  cachedToken = { value: body.access_token, expiresAt: Date.now() + ttlMs }
  return body.access_token
}

function authedHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    // V4 requires per-request trace + idempotency identifiers.
    'X-Trace-Id': crypto.randomUUID(),
    'X-Idempotency-Key': crypto.randomUUID(),
  }
}

// ---- Charge shapes --------------------------------------------------------

export interface FlutterwaveNextAction {
  type: 'redirect_url' | 'payment_instruction' | string
  redirect_url?: { url: string }
  payment_instruction?: Record<string, unknown>
}

export interface FlutterwaveCharge {
  id: string
  reference: string
  // succeeded | pending | failed | processing | ...
  status: string
  amount?: number
  currency?: string
  next_action?: FlutterwaveNextAction
  processor_response?: { code?: string; type?: string }
}

export interface CreateChargeInput {
  reference: string
  amount: number // major units
  currency: CurrencyCode
  redirectUrl: string
  customer: { email: string; firstName?: string; lastName?: string; phone?: string }
  paymentMethod: Record<string, unknown>
  meta?: Record<string, unknown>
}

/** Initiate an orchestrator direct-charge. */
export async function createCharge(input: CreateChargeInput): Promise<FlutterwaveCharge> {
  const token = await getAccessToken()
  const res = await fetch(`${baseUrl()}/orchestration/direct-charges`, {
    method: 'POST',
    headers: authedHeaders(token),
    body: JSON.stringify({
      reference: input.reference,
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      customer: {
        email: input.customer.email,
        name: {
          first: input.customer.firstName || 'Customer',
          last: input.customer.lastName || '-',
        },
        ...(input.customer.phone ? { phone: { number: input.customer.phone } } : {}),
      },
      payment_method: input.paymentMethod,
      meta: input.meta ?? {},
    }),
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as {
    data?: FlutterwaveCharge
    message?: string
    error?: { message?: string }
  } & Partial<FlutterwaveCharge>
  // V4 responses wrap the charge in `data`; tolerate a flat shape too.
  const charge = (body.data ?? (body.id ? (body as FlutterwaveCharge) : undefined)) as
    | FlutterwaveCharge
    | undefined
  if (!res.ok || !charge?.id) {
    throw new Error(
      `Flutterwave charge failed: ${body.error?.message ?? body.message ?? `HTTP ${res.status}`}`,
    )
  }
  return charge
}

/** Retrieve a charge by its Flutterwave id to confirm final status. */
export async function retrieveCharge(id: string): Promise<FlutterwaveCharge> {
  const token = await getAccessToken()
  const res = await fetch(`${baseUrl()}/charges/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: authedHeaders(token),
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as {
    data?: FlutterwaveCharge
    message?: string
  } & Partial<FlutterwaveCharge>
  const charge = (body.data ?? (body.id ? (body as FlutterwaveCharge) : undefined)) as
    | FlutterwaveCharge
    | undefined
  if (!res.ok || !charge?.id) {
    throw new Error(`Flutterwave retrieve failed: ${body.message ?? `HTTP ${res.status}`}`)
  }
  return charge
}

/** True once the gateway reports the money has actually landed. */
export function isChargeSuccessful(status: string): boolean {
  return status === 'succeeded' || status === 'success' || status === 'successful'
}

// ---- Per-country payment method ------------------------------------------

// Maps our payout-network keys to Flutterwave V4 mobile-money network codes.
// CONFIRM these against the networks enabled on your Flutterwave account.
const MOBILE_MONEY_NETWORK: Record<string, string> = {
  mtn: 'MTN',
  telecel: 'VODAFONE', // Telecel Ghana is still 'VODAFONE' on Flutterwave
  airteltigo: 'AIRTELTIGO',
  mpesa: 'MPESA',
  airtel: 'AIRTEL',
}

const DIAL_CODE: Record<CountryCode, string> = {
  GH: '233',
  KE: '254',
  NG: '234',
  ZA: '27',
}

/**
 * Build the V4 `payment_method` object for a country.
 * - GH/KE: mobile money (needs the customer's phone + chosen network).
 * - NG/ZA: bank transfer (Flutterwave returns a redirect / pay-in instruction).
 */
export function paymentMethodForCountry(
  country: CountryCode,
  opts: { phone?: string; network?: string },
): Record<string, unknown> {
  if (country === 'GH' || country === 'KE') {
    const network = MOBILE_MONEY_NETWORK[(opts.network ?? '').toLowerCase()] ?? 'MTN'
    return {
      type: 'mobile_money',
      mobile_money: {
        country_code: DIAL_CODE[country],
        network,
        phone_number: opts.phone ?? '',
      },
    }
  }
  // NG / ZA — bank transfer redirect/instruction flow.
  return { type: 'bank_transfer' }
}
