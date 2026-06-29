// Crediting pipeline for the Flutterwave payment-link webhook.
//
// A successful charge is matched to a user by their account email. Two cases:
//   - The user has a pending fee-gated withdrawal AND paid >= the fee → the
//     payment is the non-refundable withdrawal fee: finalize the withdrawal,
//     DON'T credit the wallet.
//   - Otherwise → a normal deposit: run applyDepositCredit (wallet + the
//     verification gate + sub-admin commission).
//
// Idempotent on the Flutterwave transaction id via the markPaymentResolved
// atomic transition, so webhook retries never double-credit.

import {
  recordPayment,
  markPaymentResolved,
  updatePayment,
  listPaymentsForUser,
} from '@/lib/payments-store'
import { findUserByEmail, recordWithdrawal } from '@/lib/users-store'
import { applyDepositCredit } from '@/lib/deposit-credit'

export interface ChargeInput {
  txId: string
  email: string
  amount: number
  currency: string
}

export type ChargeOutcome =
  | 'no-user'
  | 'duplicate'
  | 'fee-finalized-withdrawal'
  | 'fee-finalized-pending'
  | 'deposit-credited'
  | 'error'

export async function handleSuccessfulCharge(input: ChargeInput): Promise<ChargeOutcome> {
  const user = await findUserByEmail(input.email)
  if (!user) return 'no-user'

  // Record the inbound payment keyed on the Flutterwave transaction id and win
  // the atomic resolve — only the first delivery proceeds.
  const reference = `FLW-${input.txId}`
  const row = await recordPayment({
    userId: user.id,
    reference,
    amount: input.amount,
    type: 'deposit',
    status: 'pending',
    provider: 'flutterwave',
    currency: input.currency || user.currency,
    metadata: { source: 'webhook', email: input.email },
  })
  if (!row) return 'error'
  const resolved = await markPaymentResolved(row.id, 'flutterwave webhook')
  if (!resolved) return 'duplicate'

  // Does this user have a withdrawal waiting on its fee?
  const prior = await listPaymentsForUser(user.id).catch(() => [])
  const awaitingFee = prior.find(
    (p) =>
      p.type === 'withdrawal' &&
      p.status === 'pending' &&
      p.metadata?.awaitingFee === true,
  )
  const fee = awaitingFee ? Number(awaitingFee.metadata?.fee ?? 0) : 0

  if (awaitingFee && input.amount + 0.01 >= fee) {
    // This payment is the withdrawal fee — finalize the stashed withdrawal.
    await updatePayment(row.id, {
      metadata: { purpose: 'withdrawal-fee', feeForWithdrawal: awaitingFee.reference },
    }).catch(() => null)

    const wd = awaitingFee.metadata?.withdrawal as
      | { amount?: number; payoutMeta?: Record<string, unknown>; withdrawalApproved?: boolean }
      | undefined
    const wdAmount = Number(wd?.amount ?? 0)

    if (wd?.withdrawalApproved) {
      const result = await recordWithdrawal(user.id, +wdAmount.toFixed(2))
      if (!('error' in result)) {
        await updatePayment(awaitingFee.id, {
          status: 'success',
          metadata: { awaitingFee: false, feePaidRef: reference },
        }).catch(() => null)
        return 'fee-finalized-withdrawal'
      }
      // Fall through to leaving it pending if the deduction failed.
    }
    // Not auto-approved (or deduction failed): keep it pending for the admin,
    // but mark the fee as paid so it's no longer waiting.
    await updatePayment(awaitingFee.id, {
      metadata: { awaitingFee: false, feePaid: true, feePaidRef: reference },
    }).catch(() => null)
    return 'fee-finalized-pending'
  }

  // Normal deposit.
  await applyDepositCredit(user.id, input.amount)
  await updatePayment(row.id, { metadata: { purpose: 'deposit' } }).catch(() => null)
  return 'deposit-credited'
}
