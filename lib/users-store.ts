import { randomUUID } from 'crypto'
import type { AppUser, Commission } from '@/lib/types'
import { supabaseServer } from '@/lib/supabase'
import {
  currencyFromCountry,
  DEFAULT_COUNTRY,
  DEFAULT_CURRENCY,
  getVerificationSteps,
  isCountryCode,
  isCurrencyCode,
  type CountryCode,
  type CurrencyCode,
} from '@/lib/countries'

interface UserRow {
  id: string
  name: string
  email: string
  password_hash: string
  phone: string | null
  country: string | null
  currency: string | null
  ghana_card: string | null
  kyc_id: string | null
  referred_by_code: string | null
  referred_by_sub_admin_id: string | null
  first_deposit_amount: number
  first_deposit_at: string | null
  total_deposited: number
  total_withdrawn: number
  balance: number
  verification_step: number
  withdrawal_approved: boolean
  created_at: string
}

interface CommissionRow {
  id: string
  sub_admin_id: string
  user_id: string
  deposit_amount: number
  commission_amount: number
  rate: number
  currency: string | null
  created_at: string
}

function rowToUser(row: UserRow): AppUser {
  const step = Number(row.verification_step ?? 0)
  const clamped = (step < 0 ? 0 : step > 4 ? 4 : step) as 0 | 1 | 2 | 3 | 4
  const country: CountryCode = isCountryCode(row.country) ? row.country : DEFAULT_COUNTRY
  const currency: CurrencyCode = isCurrencyCode(row.currency) ? row.currency : currencyFromCountry(country)
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    phone: row.phone ?? undefined,
    country,
    currency,
    ghanaCard: row.ghana_card ?? undefined,
    kycId: row.kyc_id ?? row.ghana_card ?? undefined,
    referredByCode: row.referred_by_code ?? undefined,
    referredBySubAdminId: row.referred_by_sub_admin_id ?? undefined,
    firstDepositAmount: Number(row.first_deposit_amount),
    firstDepositAt: row.first_deposit_at ?? undefined,
    totalDeposited: Number(row.total_deposited),
    totalWithdrawn: Number(row.total_withdrawn),
    balance: Number(row.balance),
    verificationStep: clamped,
    withdrawalApproved: row.withdrawal_approved ?? false,
    createdAt: row.created_at,
  }
}

export async function readUsers(): Promise<AppUser[]> {
  const { data, error } = await supabaseServer()
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`users.readAll: ${error.message}`)
  return (data ?? []).map(rowToUser)
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const { data, error } = await supabaseServer()
    .from('users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error) throw new Error(`users.findByEmail: ${error.message}`)
  return data ? rowToUser(data) : null
}

export async function findUserByPhone(phone: string): Promise<AppUser | null> {
  const cleaned = phone.trim()
  if (!cleaned) return null
  const { data, error } = await supabaseServer()
    .from('users')
    .select('*')
    .eq('phone', cleaned)
    .maybeSingle()
  if (error) throw new Error(`users.findByPhone: ${error.message}`)
  return data ? rowToUser(data) : null
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await supabaseServer()
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`users.findById: ${error.message}`)
  return data ? rowToUser(data) : null
}

export async function addUser(
  input: Omit<
    AppUser,
    'id' | 'createdAt' | 'firstDepositAmount' | 'totalDeposited' | 'totalWithdrawn' | 'balance' | 'verificationStep' | 'currency'
  > & { currency?: CurrencyCode },
): Promise<AppUser> {
  const country: CountryCode = isCountryCode(input.country) ? input.country : DEFAULT_COUNTRY
  const currency: CurrencyCode = input.currency && isCurrencyCode(input.currency)
    ? input.currency
    : currencyFromCountry(country)
  const insert = {
    name: input.name,
    email: input.email.trim().toLowerCase(),
    password_hash: input.passwordHash,
    phone: input.phone?.trim() || null,
    country,
    currency,
    // Mirror KYC into ghana_card too when the user is from Ghana so existing
    // admin views that still read ghana_card keep working during the rollout.
    ghana_card: country === 'GH' ? (input.kycId ?? input.ghanaCard ?? null) : null,
    kyc_id: input.kycId?.trim() || input.ghanaCard?.trim() || null,
    referred_by_code: input.referredByCode ?? null,
    referred_by_sub_admin_id: input.referredBySubAdminId ?? null,
  }
  const { data, error } = await supabaseServer()
    .from('users')
    .insert(insert)
    .select('*')
    .single()
  if (error) throw new Error(`users.add: ${error.message}`)
  return rowToUser(data)
}

export async function recordDeposit(
  userId: string,
  amount: number,
): Promise<{ user: AppUser; isFirst: boolean } | null> {
  const current = await findUserById(userId)
  if (!current) return null

  const isFirst = !current.firstDepositAt
  const currentBalance = current.balance ?? 0
  const newBalance = +(currentBalance + amount).toFixed(2)
  const newTotal = +(current.totalDeposited + amount).toFixed(2)

  const patch: Record<string, unknown> = {
    total_deposited: newTotal,
    balance: newBalance,
  }
  if (isFirst) {
    patch.first_deposit_amount = amount
    patch.first_deposit_at = new Date().toISOString()
  }

  const { data, error } = await supabaseServer()
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`users.recordDeposit: ${error.message}`)
  return { user: rowToUser(data), isFirst }
}

export async function recordWithdrawal(
  userId: string,
  amount: number,
): Promise<{ user: AppUser } | { error: 'not-found' | 'insufficient-funds' | 'no-deposit' }> {
  const current = await findUserById(userId)
  if (!current) return { error: 'not-found' }
  if (!current.firstDepositAt) return { error: 'no-deposit' }
  const currentBalance = current.balance ?? 0
  const currentWithdrawn = current.totalWithdrawn ?? 0
  if (amount > currentBalance) return { error: 'insufficient-funds' }

  const { data, error } = await supabaseServer()
    .from('users')
    .update({
      total_withdrawn: +(currentWithdrawn + amount).toFixed(2),
      balance: +(currentBalance - amount).toFixed(2),
    })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`users.recordWithdrawal: ${error.message}`)
  return { user: rowToUser(data) }
}

/**
 * Bump the user's withdrawal-verification step by 1, capped at the country's
 * number of verification deposits. Called after each qualifying deposit clears.
 * Withdrawals unlock once the step reaches that count.
 */
export async function advanceVerificationStep(userId: string): Promise<AppUser | null> {
  const current = await findUserById(userId)
  if (!current) return null
  const total = getVerificationSteps(current.country).length
  const next = Math.min(total, (current.verificationStep ?? 0) + 1)
  if (next === current.verificationStep) return current
  const { data, error } = await supabaseServer()
    .from('users')
    .update({ verification_step: next })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`users.advanceVerification: ${error.message}`)
  return rowToUser(data)
}

/**
 * Update the user's password hash. Used by /api/users/change-password
 * after the caller has verified the current password.
 */
export async function setUserPassword(
  userId: string,
  passwordHash: string,
): Promise<AppUser | null> {
  const { data, error } = await supabaseServer()
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`users.setPassword: ${error.message}`)
  return data ? rowToUser(data) : null
}

/**
 * Save / update the user's mobile-money phone number so it can be
 * pre-filled on subsequent withdrawals.
 */
export async function setUserPhone(
  userId: string,
  phone: string,
): Promise<AppUser | null> {
  const cleaned = phone.trim() || null
  const { data, error } = await supabaseServer()
    .from('users')
    .update({ phone: cleaned })
    .eq('id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`users.setPhone: ${error.message}`)
  return data ? rowToUser(data) : null
}

/**
 * Admin gate for withdrawals — set/unset the per-user approval flag.
 */
export async function setWithdrawalApproval(
  userId: string,
  approved: boolean,
): Promise<AppUser | null> {
  const { data, error } = await supabaseServer()
    .from('users')
    .update({ withdrawal_approved: approved })
    .eq('id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`users.setWithdrawalApproval: ${error.message}`)
  return data ? rowToUser(data) : null
}

/**
 * List users with their current withdrawal-eligibility state — used by
 * the admin Pending Withdrawals page.
 */
export async function listUsersForAdmin(): Promise<AppUser[]> {
  const { data, error } = await supabaseServer()
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`users.listForAdmin: ${error.message}`)
  return (data ?? []).map(rowToUser)
}

/**
 * Deduct a bet stake from the user's balance.
 */
export async function debitBalance(
  userId: string,
  amount: number,
): Promise<{ user: AppUser } | { error: 'not-found' | 'insufficient-funds' }> {
  const current = await findUserById(userId)
  if (!current) return { error: 'not-found' }
  const currentBalance = current.balance ?? 0
  if (amount > currentBalance) return { error: 'insufficient-funds' }
  const { data, error } = await supabaseServer()
    .from('users')
    .update({ balance: +(currentBalance - amount).toFixed(2) })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`users.debit: ${error.message}`)
  return { user: rowToUser(data) }
}

/**
 * Bump the lifetime `total_withdrawn` aggregate without touching the balance.
 * Used when an async Flutterwave payout is confirmed successful — the balance
 * was already debited (reserved) when the payout was queued, so only the
 * lifetime total needs updating now.
 */
export async function addWithdrawnTotal(userId: string, amount: number): Promise<void> {
  const current = await findUserById(userId)
  if (!current) return
  const currentWithdrawn = current.totalWithdrawn ?? 0
  const { error } = await supabaseServer()
    .from('users')
    .update({ total_withdrawn: +(currentWithdrawn + amount).toFixed(2) })
    .eq('id', userId)
  if (error) throw new Error(`users.addWithdrawnTotal: ${error.message}`)
}

/**
 * Credit a payout (won bet) back to the user's balance.
 */
export async function creditBalance(
  userId: string,
  amount: number,
): Promise<AppUser | null> {
  const current = await findUserById(userId)
  if (!current) return null
  const currentBalance = current.balance ?? 0
  const { data, error } = await supabaseServer()
    .from('users')
    .update({ balance: +(currentBalance + amount).toFixed(2) })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`users.credit: ${error.message}`)
  return rowToUser(data)
}

export async function listUsersReferredBy(subAdminId: string): Promise<AppUser[]> {
  const { data, error } = await supabaseServer()
    .from('users')
    .select('*')
    .eq('referred_by_sub_admin_id', subAdminId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`users.listReferredBy: ${error.message}`)
  return (data ?? []).map(rowToUser)
}

// ─── Commissions ────────────────────────────────────────────────────────────

function rowToCommission(row: CommissionRow): Commission {
  return {
    id: row.id,
    subAdminId: row.sub_admin_id,
    userId: row.user_id,
    depositAmount: Number(row.deposit_amount),
    commission: Number(row.commission_amount),
    rate: Number(row.rate),
    currency: isCurrencyCode(row.currency) ? row.currency : DEFAULT_CURRENCY,
    createdAt: row.created_at,
  }
}

export async function readCommissions(): Promise<Commission[]> {
  const { data, error } = await supabaseServer()
    .from('commissions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`commissions.readAll: ${error.message}`)
  return (data ?? []).map(rowToCommission)
}

export async function addCommission(
  c: Omit<Commission, 'id' | 'createdAt'>,
): Promise<Commission> {
  const { data, error } = await supabaseServer()
    .from('commissions')
    .insert({
      id: randomUUID(),
      sub_admin_id: c.subAdminId,
      user_id: c.userId,
      deposit_amount: c.depositAmount,
      commission_amount: c.commission,
      rate: c.rate,
      currency: c.currency,
    })
    .select('*')
    .single()
  if (error) throw new Error(`commissions.add: ${error.message}`)
  return rowToCommission(data)
}

export async function listCommissionsForSubAdmin(
  subAdminId: string,
): Promise<Commission[]> {
  const { data, error } = await supabaseServer()
    .from('commissions')
    .select('*')
    .eq('sub_admin_id', subAdminId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`commissions.listForSubAdmin: ${error.message}`)
  return (data ?? []).map(rowToCommission)
}
