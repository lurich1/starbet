// Shared verify-then-credit pipeline for Flutterwave V4 charges.
//
// Idempotent on our `reference`: once the payment row is marked success we
// short-circuit to 'already-credited'. We confirm against Flutterwave by the
// charge id we stored on the pending row at creation time.
//
// `credit: false` is used by the withdrawal-fee flow — the fee is verified and
// marked paid but NEVER added to the wallet balance.

import { findPaymentByReference, markPaymentResolved } from '@/lib/payments-store'
import { retrieveCharge, isChargeSuccessful } from '@/lib/flutterwave'
import { applyDepositCredit } from '@/lib/deposit-credit'

export type FlutterwaveCreditStatus =
  | 'success'
  | 'already-credited'
  | 'missing-reference'
  | 'unknown-reference'
  | 'missing-charge-id'
  | 'verify-failed'
  | 'amount-mismatch'
  | 'no-user'
  | 'credit-failed'
  | string

export interface FlutterwaveCreditResult {
  status: FlutterwaveCreditStatus
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

  const chargeId =
    typeof pending.metadata?.flwChargeId === 'string'
      ? (pending.metadata.flwChargeId as string)
      : ''
  if (!chargeId) return { status: 'missing-charge-id', ok: false, reference }

  let charge
  try {
    charge = await retrieveCharge(chargeId)
  } catch (e) {
    console.error('[flutterwave-credit] retrieve failed:', e)
    return { status: 'verify-failed', ok: false, reference }
  }

  if (!isChargeSuccessful(charge.status)) {
    return { status: charge.status, ok: false, reference }
  }

  if (typeof charge.amount === 'number' && Math.abs(charge.amount - pending.amount) > 0.01) {
    console.error('[flutterwave-credit] amount mismatch', {
      reference,
      expected: pending.amount,
      paid: charge.amount,
    })
    return { status: 'amount-mismatch', ok: false, reference }
  }

  if (opts.credit && !pending.userId) {
    return { status: 'no-user', ok: false, reference }
  }

  try {
    const resolved = await markPaymentResolved(pending.id, 'flutterwave verified')
    if (!resolved) {
      // Another path already resolved this reference.
      return { status: 'already-credited', ok: true, reference }
    }
    if (opts.credit && pending.userId) {
      await applyDepositCredit(pending.userId, pending.amount)
    }
  } catch (e) {
    console.error('[flutterwave-credit] credit pipeline failed:', e)
    return { status: 'credit-failed', ok: false, reference }
  }

  return { status: 'success', ok: true, reference }
}
