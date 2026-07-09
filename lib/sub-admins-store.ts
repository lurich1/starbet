import { randomInt } from 'crypto'
import type { SubAdmin } from '@/lib/types'
import { supabaseServer } from '@/lib/supabase'
import { SUPPORTED_CURRENCY_CODES, type CurrencyCode } from '@/lib/countries'

interface SubAdminRow {
  id: string
  name: string
  email: string
  password_hash: string
  referral_code: string
  approved: boolean
  commission_balance: number
  total_commission_earned: number
  commission_balances: Record<string, number> | null
  total_commission_earned_by: Record<string, number> | null
  created_at: string
}

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function sanitiseCurrencyMap(input: Record<string, unknown> | null | undefined): Partial<Record<CurrencyCode, number>> {
  if (!input) return {}
  const out: Partial<Record<CurrencyCode, number>> = {}
  for (const code of SUPPORTED_CURRENCY_CODES) {
    const v = Number(input[code])
    if (Number.isFinite(v) && v !== 0) out[code] = +v.toFixed(2)
  }
  return out
}

function rowToSubAdmin(row: SubAdminRow): SubAdmin {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    referralCode: row.referral_code,
    approved: row.approved,
    createdAt: row.created_at,
    commissionBalance: Number(row.commission_balance),
    totalCommissionEarned: Number(row.total_commission_earned),
    commissionBalances: sanitiseCurrencyMap(row.commission_balances),
    totalCommissionEarnedBy: sanitiseCurrencyMap(row.total_commission_earned_by),
  }
}

export async function readSubAdmins(): Promise<SubAdmin[]> {
  const { data, error } = await supabaseServer()
    .from('sub_admins')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`subAdmins.readAll: ${error.message}`)
  return (data ?? []).map(rowToSubAdmin)
}

function generateReferralCode(length = 6): string {
  let s = ''
  for (let i = 0; i < length; i++) s += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]
  return s
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateReferralCode()
    const { data, error } = await supabaseServer()
      .from('sub_admins')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle()
    if (error) throw new Error(`subAdmins.generateCode: ${error.message}`)
    if (!data) return code
  }
  return generateReferralCode(8)
}

export async function findSubAdminByEmail(email: string): Promise<SubAdmin | null> {
  const { data, error } = await supabaseServer()
    .from('sub_admins')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error) throw new Error(`subAdmins.findByEmail: ${error.message}`)
  return data ? rowToSubAdmin(data) : null
}

export async function findSubAdminById(id: string): Promise<SubAdmin | null> {
  const { data, error } = await supabaseServer()
    .from('sub_admins')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`subAdmins.findById: ${error.message}`)
  return data ? rowToSubAdmin(data) : null
}

export async function findSubAdminByReferralCode(
  code: string,
): Promise<SubAdmin | null> {
  const { data, error } = await supabaseServer()
    .from('sub_admins')
    .select('*')
    .eq('referral_code', code.trim().toUpperCase())
    .maybeSingle()
  if (error) throw new Error(`subAdmins.findByCode: ${error.message}`)
  return data ? rowToSubAdmin(data) : null
}

export async function addSubAdmin(
  input: Omit<
    SubAdmin,
    'id' | 'createdAt' | 'commissionBalance' | 'totalCommissionEarned' | 'commissionBalances' | 'totalCommissionEarnedBy'
  >,
): Promise<SubAdmin> {
  const { data, error } = await supabaseServer()
    .from('sub_admins')
    .insert({
      name: input.name,
      email: input.email.trim().toLowerCase(),
      password_hash: input.passwordHash,
      referral_code: input.referralCode.toUpperCase(),
      approved: input.approved ?? false,
    })
    .select('*')
    .single()
  if (error) throw new Error(`subAdmins.add: ${error.message}`)
  return rowToSubAdmin(data)
}

export async function updateSubAdmin(
  id: string,
  patch: Partial<SubAdmin>,
): Promise<SubAdmin | null> {
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.email !== undefined) dbPatch.email = patch.email.trim().toLowerCase()
  if (patch.passwordHash !== undefined) dbPatch.password_hash = patch.passwordHash
  if (patch.referralCode !== undefined)
    dbPatch.referral_code = patch.referralCode.toUpperCase()
  if (patch.approved !== undefined) dbPatch.approved = patch.approved
  if (patch.commissionBalance !== undefined)
    dbPatch.commission_balance = patch.commissionBalance
  if (patch.totalCommissionEarned !== undefined)
    dbPatch.total_commission_earned = patch.totalCommissionEarned
  if (patch.commissionBalances !== undefined)
    dbPatch.commission_balances = patch.commissionBalances
  if (patch.totalCommissionEarnedBy !== undefined)
    dbPatch.total_commission_earned_by = patch.totalCommissionEarnedBy

  if (Object.keys(dbPatch).length === 0) {
    return findSubAdminById(id)
  }

  const { data, error } = await supabaseServer()
    .from('sub_admins')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`subAdmins.update: ${error.message}`)
  return data ? rowToSubAdmin(data) : null
}

/**
 * Add `amount` of `currency` to the sub-admin's balance map (and lifetime
 * total map). Currency is required now that wallets can be GHS/NGN/KES/ZAR.
 *
 * For backwards compatibility we also bump the legacy GHS scalar columns
 * whenever the currency is GHS, so any older admin code that reads
 * `commission_balance` directly keeps working until those callers are gone.
 */
export async function creditCommission(
  id: string,
  amount: number,
  currency: CurrencyCode,
): Promise<SubAdmin | null> {
  const current = await findSubAdminById(id)
  if (!current) return null
  const nextBalances = { ...current.commissionBalances }
  const nextLifetime = { ...current.totalCommissionEarnedBy }
  nextBalances[currency] = +(((nextBalances[currency] ?? 0) + amount)).toFixed(2)
  nextLifetime[currency] = +(((nextLifetime[currency] ?? 0) + amount)).toFixed(2)

  const patch: Partial<SubAdmin> = {
    commissionBalances: nextBalances,
    totalCommissionEarnedBy: nextLifetime,
  }
  if (currency === 'GHS') {
    patch.commissionBalance = +(current.commissionBalance + amount).toFixed(2)
    patch.totalCommissionEarned = +(current.totalCommissionEarned + amount).toFixed(2)
  }
  return updateSubAdmin(id, patch)
}

/**
 * Claw back commission from a sub-admin's payable balance for one currency —
 * used when a referred customer withdraws money (the commission on funds that
 * are leaving is reversed). Floored at 0 so the balance never goes negative,
 * and lifetime `totalCommissionEarnedBy` is left as the historical record.
 */
export async function debitCommission(
  id: string,
  amount: number,
  currency: CurrencyCode,
): Promise<SubAdmin | null> {
  const current = await findSubAdminById(id)
  if (!current) return null
  const nextBalances = { ...current.commissionBalances }
  nextBalances[currency] = Math.max(0, +(((nextBalances[currency] ?? 0) - amount)).toFixed(2))

  const patch: Partial<SubAdmin> = { commissionBalances: nextBalances }
  if (currency === 'GHS') {
    patch.commissionBalance = Math.max(0, +(current.commissionBalance - amount).toFixed(2))
  }
  return updateSubAdmin(id, patch)
}

/**
 * Zero out the sub-admin's balance for one specific currency — used when the
 * admin marks a per-currency payout as paid. Lifetime totals are untouched.
 */
export async function clearCommissionBalance(
  id: string,
  currency: CurrencyCode,
): Promise<SubAdmin | null> {
  const current = await findSubAdminById(id)
  if (!current) return null
  const next = { ...current.commissionBalances }
  next[currency] = 0
  const patch: Partial<SubAdmin> = { commissionBalances: next }
  if (currency === 'GHS') patch.commissionBalance = 0
  return updateSubAdmin(id, patch)
}

/**
 * Fresh start for every partner: delete all commission history rows and zero
 * every sub-admin's payable balances. When `keepLifetime` is true the lifetime
 * "total earned" figures are preserved; otherwise everything resets to 0.
 * Returns how many commission rows were removed.
 */
export async function resetAllCommissions(
  opts: { keepLifetime?: boolean } = {},
): Promise<{ deleted: number }> {
  const sb = supabaseServer()

  // Supabase requires a filter on delete/update — `id is not null` matches all.
  const { data: deletedRows, error: delErr } = await sb
    .from('commissions')
    .delete()
    .not('id', 'is', null)
    .select('id')
  if (delErr) throw new Error(`commissions.deleteAll: ${delErr.message}`)

  const patch: Record<string, unknown> = {
    commission_balance: 0,
    commission_balances: {},
  }
  if (!opts.keepLifetime) {
    patch.total_commission_earned = 0
    patch.total_commission_earned_by = {}
  }
  const { error: updErr } = await sb.from('sub_admins').update(patch).not('id', 'is', null)
  if (updErr) throw new Error(`sub_admins.resetCommissions: ${updErr.message}`)

  return { deleted: deletedRows?.length ?? 0 }
}

export async function deleteSubAdmin(id: string): Promise<boolean> {
  const { error, count } = await supabaseServer()
    .from('sub_admins')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw new Error(`subAdmins.delete: ${error.message}`)
  return (count ?? 0) > 0
}
