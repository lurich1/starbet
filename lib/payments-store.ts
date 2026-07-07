import { supabaseServer } from '@/lib/supabase'

export type PaymentType = 'deposit' | 'withdrawal'
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled'

export interface PaymentRecord {
  id: string
  userId: string | null
  reference: string
  amount: number
  currency: string
  provider: string
  status: PaymentStatus
  type: PaymentType
  metadata: Record<string, unknown>
  createdAt: string
  verifiedAt: string | null
}

interface PaymentRow {
  id: string
  user_id: string | null
  reference: string
  amount: string | number
  currency: string
  provider: string
  status: PaymentStatus
  metadata: Record<string, unknown> | null
  created_at: string
  verified_at: string | null
}

function rowToRecord(row: PaymentRow): PaymentRecord {
  const meta = row.metadata ?? {}
  const rawType = typeof meta.type === 'string' ? meta.type : 'deposit'
  const type: PaymentType = rawType === 'withdrawal' ? 'withdrawal' : 'deposit'
  return {
    id: row.id,
    userId: row.user_id,
    reference: row.reference,
    amount: Number(row.amount),
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    type,
    metadata: meta,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  }
}

export interface RecordPaymentInput {
  userId: string
  reference: string
  amount: number
  type: PaymentType
  status?: PaymentStatus
  provider?: string
  currency?: string
  metadata?: Record<string, unknown>
  verifiedAt?: string | null
}

/**
 * Insert a payment row. Idempotent on `reference` — if the same reference is
 * submitted twice we silently ignore the duplicate and return the existing row,
 * so callers don't have to wrap this in their own try/catch for double-credit.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentRecord | null> {
  const supabase = supabaseServer()
  const metadata = { ...(input.metadata ?? {}), type: input.type }
  const row = {
    user_id: input.userId,
    reference: input.reference,
    amount: input.amount,
    currency: input.currency ?? 'GHS',
    provider: input.provider ?? 'moolre',
    status: input.status ?? 'success',
    metadata,
    verified_at: input.verifiedAt ?? new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('payments')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    // 23505 = unique_violation on `reference` — return the existing row.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('payments')
        .select('*')
        .eq('reference', input.reference)
        .maybeSingle()
      return existing ? rowToRecord(existing as PaymentRow) : null
    }
    throw new Error(`payments.record: ${error.message}`)
  }
  return rowToRecord(data as PaymentRow)
}

/**
 * Timestamp of the user's most recent *successful deposit*, or null if they've
 * never had one clear. Used by the 24h stake gate so a player must keep
 * topping up instead of recycling the same wallet balance forever.
 *
 * The `metadata->>'type'` filter isn't cleanly typed in supabase-js, so we pull
 * the newest successful rows and filter for deposits in JS (a user's payment
 * history stays small). We prefer `verified_at` — when the money actually
 * cleared — and fall back to `created_at`.
 */
export async function latestSuccessfulDepositAt(userId: string): Promise<string | null> {
  const { data, error } = await supabaseServer()
    .from('payments')
    .select('created_at, verified_at, metadata')
    .eq('user_id', userId)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(`payments.latestDeposit: ${error.message}`)
  for (const row of (data ?? []) as PaymentRow[]) {
    const meta = row.metadata ?? {}
    const type = typeof meta.type === 'string' ? meta.type : 'deposit'
    if (type !== 'withdrawal') return row.verified_at ?? row.created_at
  }
  return null
}

export async function listPaymentsForUser(userId: string): Promise<PaymentRecord[]> {
  const { data, error } = await supabaseServer()
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`payments.listForUser: ${error.message}`)
  return ((data ?? []) as PaymentRow[]).map(rowToRecord)
}

/**
 * Admin list — every payment row, newest first. Filter by type client-side
 * (the JSONB->>'type' filter isn't typed in supabase-js without escapes, so we
 * just fetch and filter since this table stays small in the demo deployment).
 */
export async function listAllPayments(opts?: {
  type?: PaymentType
  limit?: number
}): Promise<PaymentRecord[]> {
  const { data, error } = await supabaseServer()
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 500)
  if (error) throw new Error(`payments.listAll: ${error.message}`)
  const all = ((data ?? []) as PaymentRow[]).map(rowToRecord)
  return opts?.type ? all.filter((p) => p.type === opts.type) : all
}

export async function findPaymentById(id: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseServer()
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`payments.findById: ${error.message}`)
  return data ? rowToRecord(data as PaymentRow) : null
}

export async function findPaymentByReference(
  reference: string,
): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseServer()
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle()
  if (error) throw new Error(`payments.findByReference: ${error.message}`)
  return data ? rowToRecord(data as PaymentRow) : null
}

/**
 * Atomically flip a non-success payment row to success and stamp who
 * resolved it. The `.in('status', …)` filter means only ONE concurrent
 * caller wins — if the row is already success, no rows are updated and
 * we return null. Callers MUST treat a null return as "another path
 * already credited this payment, do nothing more" so two callers can't
 * both run applyDepositCredit on the same row.
 *
 * Returns the updated record on success, null if the row was already
 * resolved OR doesn't exist.
 */
/**
 * Patch a payment's status and/or merge into its metadata. Used by the
 * Flutterwave webhook to mark a fee-gated withdrawal as fee-paid.
 */
export async function updatePayment(
  id: string,
  patch: { status?: PaymentStatus; metadata?: Record<string, unknown> },
): Promise<PaymentRecord | null> {
  const existing = await findPaymentById(id)
  if (!existing) return null
  const mergedMeta = { ...existing.metadata, ...(patch.metadata ?? {}), type: existing.type }
  const update: Record<string, unknown> = { metadata: mergedMeta }
  if (patch.status) update.status = patch.status
  const { data, error } = await supabaseServer()
    .from('payments')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`payments.update: ${error.message}`)
  return data ? rowToRecord(data as PaymentRow) : null
}

/**
 * Atomically settle a queued withdrawal by its reference: flip `pending` →
 * `success` or `failed`. The `.eq('status', 'pending')` guard means only one
 * concurrent caller wins (e.g. a repeated Flutterwave `transfer.completed`
 * webhook) — everyone else gets null and must not touch the balance again.
 */
export async function resolveWithdrawalByReference(
  reference: string,
  toStatus: 'success' | 'failed',
): Promise<PaymentRecord | null> {
  const { data, error } = await supabaseServer()
    .from('payments')
    .update({ status: toStatus, verified_at: new Date().toISOString() })
    .eq('reference', reference)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`payments.resolveWithdrawal: ${error.message}`)
  return data ? rowToRecord(data as PaymentRow) : null
}

export async function markPaymentResolved(
  id: string,
  note?: string,
): Promise<PaymentRecord | null> {
  const existing = await findPaymentById(id)
  if (!existing) return null
  if (existing.status === 'success') return null
  const mergedMeta = {
    ...existing.metadata,
    type: existing.type,
    adminResolved: true,
    resolvedAt: new Date().toISOString(),
    resolutionNote: note || undefined,
  }
  const { data, error } = await supabaseServer()
    .from('payments')
    .update({
      status: 'success',
      verified_at: new Date().toISOString(),
      metadata: mergedMeta,
    })
    .eq('id', id)
    // Postgres-level guard against concurrent double-credits — the row
    // is only updated if it was still in one of these states.
    .in('status', ['pending', 'failed', 'cancelled'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`payments.markResolved: ${error.message}`)
  return data ? rowToRecord(data as PaymentRow) : null
}
