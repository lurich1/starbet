// Verify-then-credit pipeline for Flutterwave v3 charges.
//
// Idempotent on our `reference` (== the tx_ref we sent): once the payment row
// is marked success we short-circuit to 'already-credited'. We confirm against
// Flutterwave with verify_by_reference. `credit: false` is used by the
// withdrawal-fee flow — the fee is verified but never added to the wallet.

import { findPaymentByReference, markPaymentResolved, updatePayment } from '@/lib/payments-store'
import { verifyByReference, isChargeSuccessful } from '@/lib/flutterwave'
import { applyDepositCredit } from '@/lib/deposit-credit'

export interface FlutterwaveCreditResult {
  status: string
  ok: boolean
  reference: string
}

export async function verifyAndCreditFlutterwave(
  reference: string,
  opts: { credit: boolean } = { credit: true },
): Promise<FlutterwaveCreditResult> {
  if (!reference) return { status: 'missing-reference', ok: false, reference }

  const pending = await findPaymentByReference(reference)
  if (!pending) return { status: 'unknown-reference', ok: false, reference }
  if (pending.status === 'success') {
    return { status: 'already-credited', ok: true, reference }
  }

  let verified
  try {
    verified = await verifyByReference(reference)
  } catch (e) {
    console.error('[flutterwave-credit] verify failed:', e)
    return { status: 'verify-failed', ok: false, reference }
  }

  // Not approved yet (or never will be) — report the raw status so the poller
  // keeps waiting on 'pending' and stops on a terminal failure.
  if (!isChargeSuccessful(verified.status)) {
    return { status: verified.found ? verified.status : 'pending', ok: false, reference }
  }

  if (typeof verified.amount === 'number' && Math.abs(verified.amount - pending.amount) > 0.01) {
    console.error('[flutterwave-credit] amount mismatch', {
      reference,
      expected: pending.amount,
      paid: verified.amount,
    })
    return { status: 'amount-mismatch', ok: false, reference }
  }

  if (opts.credit && !pending.userId) {
    return { status: 'no-user', ok: false, reference }
  }

  const resolved = await markPaymentResolved(pending.id, 'flutterwave verified')
  if (!resolved) {
    // Another path already resolved this reference.
    return { status: 'already-credited', ok: true, reference }
  }
  if (opts.credit && pending.userId) {
    try {
      await applyDepositCredit(pending.userId, pending.amount)
    } catch (e) {
      console.error('[flutterwave-credit] credit failed after resolve, reverting:', e)
      // Put the row back to pending so the next poll/webhook retries the credit
      // instead of short-circuiting to 'already-credited' forever.
      await updatePayment(pending.id, { status: 'pending' }).catch(() => null)
      return { status: 'credit-failed', ok: false, reference }
    }
  }

  return { status: 'success', ok: true, reference }
}
