// Flutterwave v3 Transfers (payouts) — used to send withdrawals straight to a
// customer's mobile-money wallet without a manual admin step.
//
//   POST /v3/transfers  → queues the payout (returns status 'NEW'/'PENDING')
//   The final result arrives asynchronously via the `transfer.completed`
//   webhook (status 'SUCCESSFUL' | 'FAILED'), keyed by our `reference`.
//
// Only mobile-money countries are auto-paid here (GH/KE). Bank payouts (NG/ZA)
// need a Flutterwave bank *code* we don't collect, so they stay on the manual
// approval flow.
//
// NOTE: the GH/KE mobile-money transfer bank codes below come from Flutterwave's
// GET /v3/banks/GH (and /KE) list. If a payout is rejected with an
// "invalid account_bank" style error, re-check the codes against that endpoint
// for your account — Flutterwave has changed them in the past.

import type { CountryCode, CurrencyCode } from '@/lib/countries'
import { findPaymentByReference, resolveWithdrawalByReference } from '@/lib/payments-store'
import { creditBalance, addWithdrawnTotal } from '@/lib/users-store'
import { reverseCommissionOnWithdrawal } from '@/lib/withdrawal-commission'

const BASE = 'https://api.flutterwave.com/v3'

function getSecretKey(): string {
  const v = process.env.FLUTTERWAVE_SECRET_KEY?.trim()
  if (!v) throw new Error('FLUTTERWAVE_SECRET_KEY is not configured')
  return v
}

// Our payout-network keys → Flutterwave transfer bank codes (mobile money).
const GH_TRANSFER_BANK: Record<string, string> = {
  mtn: 'MTN',
  telecel: 'VOD', // Telecel Ghana is still the ex-Vodafone code on Flutterwave
  airteltigo: 'ATL',
}
const KE_TRANSFER_BANK: Record<string, string> = {
  mpesa: 'MPS',
  airtel: 'AIRTEL',
}

/** Resolve the Flutterwave transfer `account_bank` code, or null if unsupported. */
export function transferBankCode(country: CountryCode, network: string): string | null {
  const key = (network ?? '').toLowerCase()
  if (country === 'GH') return GH_TRANSFER_BANK[key] ?? 'MTN'
  if (country === 'KE') return KE_TRANSFER_BANK[key] ?? 'MPS'
  return null
}

/** True for countries we can auto-pay via mobile-money transfer. */
export function supportsAutoTransfer(country: CountryCode): boolean {
  return country === 'GH' || country === 'KE'
}

export interface TransferResult {
  ok: boolean
  reference: string
  flwId: string | null
  status: string // 'NEW' | 'PENDING' | 'SUCCESSFUL' | 'FAILED'
  message: string | null
}

interface TransferInput {
  reference: string
  amount: number
  currency: CurrencyCode
  country: CountryCode
  network: string
  phone: string
  beneficiaryName: string
  narration?: string
}

/** Fire a mobile-money payout. Never throws on a gateway "no" — returns ok:false. */
export async function initiateMobileMoneyTransfer(input: TransferInput): Promise<TransferResult> {
  const accountBank = transferBankCode(input.country, input.network)
  if (!accountBank) {
    return {
      ok: false,
      reference: input.reference,
      flwId: null,
      status: 'FAILED',
      message: `no mobile-money transfer code for ${input.country}/${input.network}`,
    }
  }

  const payload = {
    account_bank: accountBank,
    account_number: input.phone,
    amount: input.amount,
    currency: input.currency,
    narration: input.narration ?? 'Withdrawal',
    reference: input.reference,
    beneficiary_name: input.beneficiaryName || 'Customer',
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  let res: Response
  try {
    res = await fetch(`${BASE}/transfers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: ctrl.signal,
    })
  } catch (e) {
    return {
      ok: false,
      reference: input.reference,
      flwId: null,
      status: 'FAILED',
      message: e instanceof Error ? e.message : 'flutterwave transfer request failed',
    }
  } finally {
    clearTimeout(timer)
  }

  const raw = await res.text()
  let body: {
    status?: string
    message?: string
    data?: { id?: number | string; status?: string; reference?: string }
  } = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    /* non-JSON */
  }

  if (!res.ok || body.status !== 'success' || !body.data) {
    console.error('[flutterwave] transfer error', {
      status: res.status,
      payload: { ...payload, account_number: '***' },
      response: raw.slice(0, 500),
    })
    return {
      ok: false,
      reference: input.reference,
      flwId: null,
      status: 'FAILED',
      message: body.message || raw.slice(0, 300) || `HTTP ${res.status}`,
    }
  }

  return {
    ok: true,
    reference: input.reference,
    flwId: body.data.id != null ? String(body.data.id) : null,
    status: body.data.status ?? 'NEW',
    message: body.message ?? null,
  }
}

/**
 * Settle a queued payout when its `transfer.completed` webhook arrives.
 * Idempotent: it only acts while the ledger row is still `pending`, so repeated
 * webhook deliveries (or a race with any poll) resolve the withdrawal once.
 *
 *   SUCCESSFUL → mark the withdrawal success + bump lifetime total_withdrawn
 *                (the balance was already debited when the payout was queued).
 *   FAILED     → mark it failed + refund the reserved balance.
 */
export async function finalizeTransfer(
  reference: string,
  flwStatus: string,
): Promise<void> {
  const pending = await findPaymentByReference(reference).catch(() => null)
  // Only our own queued mobile-money payouts are settled here.
  if (!pending || pending.type !== 'withdrawal' || pending.provider !== 'flutterwave') return
  if (pending.status !== 'pending') return

  const succeeded = flwStatus.toUpperCase() === 'SUCCESSFUL'
  const resolved = await resolveWithdrawalByReference(reference, succeeded ? 'success' : 'failed')
  // Lost the race — another delivery already settled this row.
  if (!resolved) return

  if (succeeded) {
    if (pending.userId) {
      await addWithdrawnTotal(pending.userId, pending.amount).catch(() => {})
      // Reverse the referrer's commission on the money that left the platform.
      await reverseCommissionOnWithdrawal(
        pending.userId,
        pending.amount,
        pending.currency as CurrencyCode,
      )
    }
  } else {
    // Refund the reserved balance so a failed payout doesn't cost the user.
    if (pending.userId) await creditBalance(pending.userId, pending.amount).catch(() => {})
  }
}
