// Flutterwave v3 integration (classic FLWSECK secret-key API).
//
// Mobile money gives the on-phone PIN/approval prompt we want:
//   - Ghana  → POST /v3/charges?type=mobile_money_ghana (MTN/Vodafone/AirtelTigo)
//   - Kenya  → POST /v3/charges?type=mpesa (STK push)
// The customer approves on their phone; we then confirm with
//   GET /v3/transactions/verify_by_reference?tx_ref=<our reference>
// and credit on a 'successful' status. Amounts are plain major units.
//
// NG/ZA (bank) fall back to v3 Standard hosted payments (a redirect link).

import type { CountryCode, CurrencyCode } from '@/lib/countries'

const BASE = 'https://api.flutterwave.com/v3'

function getSecretKey(): string {
  const v = process.env.FLUTTERWAVE_SECRET_KEY?.trim()
  if (!v) throw new Error('FLUTTERWAVE_SECRET_KEY is not configured')
  return v
}

export function getPublicKey(): string | null {
  return process.env.FLUTTERWAVE_PUBLIC_KEY?.trim() || null
}

/** Secret hash configured on the Flutterwave webhook (sent as `verif-hash`). */
export function getWebhookSecret(): string | null {
  return process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim() || null
}

/** Validate the `verif-hash` header. Fails closed if no secret is configured. */
export function isValidWebhookSignature(headerValue: string | null): boolean {
  const secret = getWebhookSecret()
  if (!secret) return false
  return headerValue === secret
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getSecretKey()}`,
    'Content-Type': 'application/json',
  }
}

// Fetch with a hard timeout and a couple of retries on transient gateway
// errors (502/503/504) or network hiccups, so a slow Flutterwave response
// doesn't immediately hard-fail the customer's payment.
async function flwFetch(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 25_000
  const retries = opts.retries ?? 2
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('flutterwave request failed')
}

// ---- Mobile-money network codes ------------------------------------------

// Our payout-network keys → Flutterwave v3 Ghana mobile-money network codes.
const GH_NETWORK: Record<string, string> = {
  mtn: 'MTN',
  telecel: 'VODAFONE', // Telecel Ghana is still 'VODAFONE' on Flutterwave
  airteltigo: 'TIGO',
}

// ---- Charge --------------------------------------------------------------

export interface MobileMoneyChargeResult {
  /** Our tx_ref — the key we verify against later. */
  reference: string
  /** Flutterwave transaction id (if returned). */
  flwId: string | null
  /** Flutterwave charge ref (flw_ref) — needed to validate an OTP. */
  flwRef: string | null
  /** Authorization mode, e.g. 'otp' when the customer must enter an SMS code. */
  authMode: string | null
  /** Charge status from the create response (usually 'pending'). */
  status: string
  /** Some networks (e.g. Vodafone voucher) need a redirect to finish. */
  redirect: string | null
  message: string | null
}

interface ChargeInput {
  reference: string
  amount: number
  currency: CurrencyCode
  country: CountryCode
  email: string
  phone: string
  fullname: string
  network?: string
}

/**
 * Trigger a mobile-money charge. The customer gets a PIN/approval prompt on
 * their phone. Only GH and KE are mobile-money countries here.
 */
export async function chargeMobileMoney(input: ChargeInput): Promise<MobileMoneyChargeResult> {
  const type = input.country === 'KE' ? 'mpesa' : 'mobile_money_ghana'
  const payload: Record<string, unknown> = {
    tx_ref: input.reference,
    amount: input.amount,
    currency: input.currency,
    email: input.email,
    phone_number: input.phone,
    fullname: input.fullname || 'Customer',
  }
  if (input.country === 'GH') {
    payload.network = GH_NETWORK[(input.network ?? '').toLowerCase()] ?? 'MTN'
  }

  const url = `${BASE}/charges?type=${type}`
  const res = await flwFetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const raw = await res.text()
  let body: {
    status?: string
    message?: string
    meta?: { authorization?: { redirect?: string; mode?: string } }
    data?: { id?: number | string; status?: string; tx_ref?: string; flw_ref?: string; auth_model?: string }
  } = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    /* non-JSON */
  }

  if (!res.ok || body.status !== 'success') {
    console.error('[flutterwave] charge error', {
      url,
      status: res.status,
      payload: { ...payload, email: '***', phone_number: '***' },
      response: raw.slice(0, 1000),
    })
    const detail = body.message || raw.slice(0, 300) || `HTTP ${res.status}`
    throw new Error(`Flutterwave charge failed (HTTP ${res.status}): ${detail}`)
  }

  return {
    reference: input.reference,
    flwId: body.data?.id != null ? String(body.data.id) : null,
    flwRef: body.data?.flw_ref ?? null,
    authMode: body.meta?.authorization?.mode ?? body.data?.auth_model ?? null,
    status: body.data?.status ?? 'pending',
    redirect: body.meta?.authorization?.redirect ?? null,
    message: body.message ?? null,
  }
}

// ---- Validate (submit OTP) ----------------------------------------------

/**
 * Submit the OTP the customer received by SMS to finish a mobile-money charge.
 * Flutterwave: POST /v3/validate-charge with the charge's flw_ref + the code.
 */
export async function validateCharge(
  flwRef: string,
  otp: string,
): Promise<{ ok: boolean; status: string; message: string | null }> {
  const res = await flwFetch(`${BASE}/validate-charge`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ type: 'mobile_money_ghana', flw_ref: flwRef, otp }),
    cache: 'no-store',
  })
  const raw = await res.text()
  let body: { status?: string; message?: string; data?: { status?: string } } = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    /* non-JSON */
  }
  const ok = res.ok && body.status === 'success'
  if (!ok) {
    console.error('[flutterwave] validate-charge error', {
      status: res.status,
      response: raw.slice(0, 500),
    })
  }
  return {
    ok,
    status: body.data?.status ?? (ok ? 'pending' : 'failed'),
    message: body.message ?? null,
  }
}

// Flutterwave Standard checkout payment options per country. GH/KE lead with
// mobile money (the customer gets the on-phone PIN prompt); card is a fallback.
const PAYMENT_OPTIONS: Record<CountryCode, string> = {
  GH: 'mobilemoneyghana,card',
  KE: 'mpesa,card',
  NG: 'card,banktransfer,account,ussd',
  ZA: 'card',
}

/**
 * v3 Standard hosted checkout. Returns a per-transaction hosted link (carrying
 * our tx_ref + a redirect_url) so the customer is brought back to the site and
 * we can credit on return. Mobile-money options still trigger the phone PIN.
 */
export async function createStandardPayment(input: {
  reference: string
  amount: number
  currency: CurrencyCode
  country: CountryCode
  email: string
  fullname: string
  phone?: string
  redirectUrl: string
}): Promise<{ link: string }> {
  // Flutterwave rejects the request ("required parameters missing") if any of
  // tx_ref / amount / currency / redirect_url / customer.email is empty. Guard
  // each so a user with a blank email/name can still check out.
  const email = input.email?.trim() || `user-${input.reference}@starbet.app`
  const amount = Number(input.amount)
  const payload = {
    tx_ref: input.reference,
    amount,
    currency: input.currency,
    redirect_url: input.redirectUrl,
    customer: {
      email,
      name: input.fullname?.trim() || 'Customer',
      ...(input.phone ? { phonenumber: input.phone } : {}),
    },
    customizations: {
      title: 'Star Bet',
      description: 'Wallet deposit',
    },
    payment_options: PAYMENT_OPTIONS[input.country] ?? 'card',
  }

  const res = await flwFetch(`${BASE}/payments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const raw = await res.text()
  let body: { status?: string; message?: string; data?: { link?: string } } = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    /* non-JSON */
  }
  if (!res.ok || body.status !== 'success' || !body.data?.link) {
    console.error('[flutterwave] payment init error', {
      status: res.status,
      payload: { ...payload, customer: { ...payload.customer, email: '***' } },
      response: raw.slice(0, 500),
    })
    const detail = body.message || raw.slice(0, 300) || `HTTP ${res.status}`
    throw new Error(`Flutterwave payment init failed (HTTP ${res.status}): ${detail}`)
  }
  return { link: body.data.link }
}

// ---- Verify --------------------------------------------------------------

export interface FlutterwaveVerifyResult {
  status: string // 'successful' | 'failed' | 'pending' | ...
  amount: number | null
  currency: string | null
  txRef: string | null
  found: boolean
}

/** Confirm a transaction by our own tx_ref (the reference we generated). */
export async function verifyByReference(reference: string): Promise<FlutterwaveVerifyResult> {
  const url = `${BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`
  const res = await flwFetch(url, { method: 'GET', headers: authHeaders(), cache: 'no-store' })
  const raw = await res.text()
  let body: {
    status?: string
    message?: string
    data?: { status?: string; amount?: number; currency?: string; tx_ref?: string }
  } = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    /* non-JSON */
  }

  // verify_by_reference 404s while no transaction exists yet (customer hasn't
  // approved). Treat that as "not found / still pending", not an error.
  if (res.status === 404 || body.status !== 'success' || !body.data) {
    return { status: 'pending', amount: null, currency: null, txRef: reference, found: false }
  }

  return {
    status: body.data.status ?? 'pending',
    amount: typeof body.data.amount === 'number' ? body.data.amount : null,
    currency: body.data.currency ?? null,
    txRef: body.data.tx_ref ?? reference,
    found: true,
  }
}

/** True once Flutterwave reports the money actually landed. */
export function isChargeSuccessful(status: string | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'successful' || s === 'success'
}
