import { NextResponse } from 'next/server'
import { findPaymentByReference, markPaymentResolved } from '@/lib/payments-store'
import { verifyTransaction, fromMinorUnits } from '@/lib/paystack'
import { applyDepositCredit } from '@/lib/deposit-credit'
import { isCurrencyCode } from '@/lib/countries'

export const dynamic = 'force-dynamic'

function sanitizeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/me'
  return raw
}

function redirectWith(originUrl: URL, path: string, status: string) {
  const url = new URL(path, originUrl)
  url.searchParams.set('paystack', status)
  return NextResponse.redirect(url, 303)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref') ?? ''
  const returnPath = sanitizeReturnPath(url.searchParams.get('returnPath'))

  if (!reference) return redirectWith(url, returnPath, 'missing-reference')

  // Look up the pending row we recorded at /start. If it's missing the user
  // hit the callback without going through our flow — let it pass through
  // as a no-op redirect rather than crediting blind.
  const pending = await findPaymentByReference(reference)
  if (!pending) return redirectWith(url, returnPath, 'unknown-reference')

  // Already credited — idempotent: just redirect with success.
  if (pending.status === 'success') return redirectWith(url, returnPath, 'already-credited')

  let verified
  try {
    verified = await verifyTransaction(reference)
  } catch (e) {
    console.error('[paystack/callback] verify failed:', e)
    return redirectWith(url, returnPath, 'verify-failed')
  }

  if (verified.status !== 'success') {
    return redirectWith(url, returnPath, verified.status)
  }

  const currency = isCurrencyCode(verified.currency) ? verified.currency : pending.currency
  const major = fromMinorUnits(verified.amount, currency as 'GHS' | 'NGN' | 'KES' | 'ZAR')

  // Sanity check: the amount the user actually paid should match the pending
  // row we recorded. If not, log and refuse to credit — admin can investigate.
  if (Math.abs(major - pending.amount) > 0.01) {
    console.error('[paystack/callback] amount mismatch', {
      reference,
      pendingAmount: pending.amount,
      paidAmount: major,
    })
    return redirectWith(url, returnPath, 'amount-mismatch')
  }

  if (!pending.userId) {
    console.error('[paystack/callback] missing userId on pending row', reference)
    return redirectWith(url, returnPath, 'no-user')
  }

  try {
    const resolved = await markPaymentResolved(pending.id, 'paystack auto-verify')
    if (!resolved) {
      // Another path (admin manual credit or a duplicate callback) already
      // ran the credit pipeline on this reference. Short-circuit so we
      // don't double-credit.
      return redirectWith(url, returnPath, 'already-credited')
    }
    await applyDepositCredit(pending.userId, pending.amount)
  } catch (e) {
    console.error('[paystack/callback] credit pipeline failed:', e)
    return redirectWith(url, returnPath, 'credit-failed')
  }

  return redirectWith(url, returnPath, 'success')
}
