import { NextResponse } from 'next/server'
import { verifyAndCreditFlutterwave } from '@/lib/flutterwave-credit'
import { findPaymentByReference, recordPayment, type PaymentRecord } from '@/lib/payments-store'
import { recordWithdrawal } from '@/lib/users-store'

export const dynamic = 'force-dynamic'

function sanitizeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/me'
  return raw
}

function redirectWith(originUrl: URL, path: string, status: string) {
  const url = new URL(path, originUrl)
  url.searchParams.set('flw', status)
  return NextResponse.redirect(url, 303)
}

// Once a withdrawal-fee charge clears, execute the withdrawal that was stashed
// on the fee payment row. Runs at most once per fee — the caller only invokes
// it when verify atomically transitioned the row to success.
async function finalizeWithdrawalFromFee(fee: PaymentRecord): Promise<void> {
  const wd = fee.metadata?.withdrawal as
    | { amount?: number; payoutMeta?: Record<string, unknown>; withdrawalApproved?: boolean }
    | undefined
  if (!fee.userId || !wd || typeof wd.amount !== 'number') return

  const payoutMeta = { ...(wd.payoutMeta ?? {}), feeReference: fee.reference }
  const wdReference = `PB-WDR-${fee.userId.slice(0, 8)}-${fee.reference.slice(-8)}`

  // Admin still has to approve actual payouts — until then it sits pending.
  if (!wd.withdrawalApproved) {
    await recordPayment({
      userId: fee.userId,
      reference: wdReference,
      amount: wd.amount,
      type: 'withdrawal',
      status: 'pending',
      provider: 'manual',
      currency: fee.currency,
      metadata: payoutMeta,
    }).catch((e) => console.error('[flutterwave/callback] pending withdrawal write failed:', e))
    return
  }

  const result = await recordWithdrawal(fee.userId, +wd.amount.toFixed(2))
  if ('error' in result) {
    console.error('[flutterwave/callback] recordWithdrawal failed:', result.error)
    return
  }
  await recordPayment({
    userId: fee.userId,
    reference: wdReference,
    amount: wd.amount,
    type: 'withdrawal',
    status: 'success',
    provider: 'manual',
    currency: fee.currency,
    metadata: payoutMeta,
  }).catch((e) => console.error('[flutterwave/callback] withdrawal ledger write failed:', e))
}

// Flutterwave redirects the customer back here after they finish paying. We
// kept our own reference in `?ref=` so we can find the pending row and confirm
// the charge by its stored id. Withdrawal-fee references are verified WITHOUT
// crediting the wallet; deposits run the full credit pipeline.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const reference = url.searchParams.get('ref') ?? ''
  const returnPath = sanitizeReturnPath(url.searchParams.get('returnPath'))

  const pending = await findPaymentByReference(reference).catch(() => null)
  const isFee = pending?.metadata?.purpose === 'withdrawal-fee'

  const result = await verifyAndCreditFlutterwave(reference, { credit: !isFee })

  // Only finalize the withdrawal when WE won the atomic resolve (status
  // 'success', not 'already-credited') so it never runs twice.
  if (isFee && pending && result.status === 'success') {
    await finalizeWithdrawalFromFee(pending)
  }

  return redirectWith(url, returnPath, result.status)
}
