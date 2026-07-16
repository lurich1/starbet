// Single source of truth for country-specific behaviour: currency, KYC field,
// phone normalisation, mobile-money networks, and deposit thresholds.
//
// Add a new country here and the registration form, formatMoney, deposit
// gateway routing, withdrawal flow, and verification gate all pick it up.

export type CountryCode = 'GH' | 'NG' | 'KE' | 'ZA'
export type CurrencyCode = 'GHS' | 'NGN' | 'KES' | 'ZAR'
export type Gateway = 'moolre' | 'paystack' | 'manual' | 'flutterwave'

export interface PayoutNetwork {
  key: string
  label: string
}

export interface CountryConfig {
  code: CountryCode
  name: string
  flag: string
  currency: CurrencyCode
  /** Symbol shown next to amounts (e.g. "GHS", "₦"). */
  currencySymbol: string
  /** Locale used by Intl/toLocaleString for grouping. */
  locale: string
  /** Dial code without "+", used to normalise +234 → 0… style phone numbers. */
  dialCode: string
  /** Whether the signup form collects (and the API requires) a KYC value. */
  requiresKyc: boolean
  /** Label shown next to the KYC input on signup. */
  kycLabel: string
  /** Placeholder / hint shown to the user. */
  kycPlaceholder: string
  /** Error message when the KYC value fails validation. */
  kycError: string
  /** Minimum first deposit required before betting unlocks. */
  minFirstDeposit: number
  /** Fallback per-step deposit amount when `verificationAmounts` isn't set. */
  verificationAmount: number
  /**
   * Per-step required deposit amounts to unlock withdrawal. The array length is
   * the number of verification deposits; each entry is the minimum for that
   * step. If omitted, falls back to 4 deposits of `verificationAmount`.
   */
  verificationAmounts?: number[]
  /** Non-refundable fee the user pays before each withdrawal (0 = no fee). */
  withdrawalFee: number
  /** Minimum a user may withdraw in one request (in the country's currency). */
  withdrawalMin: number
  /**
   * Max a user may withdraw per request BEFORE verification. `0` means
   * unverified users can't withdraw at all (the old hard verification block).
   * GH allows a small 1–30 band before verifying.
   */
  withdrawalMaxUnverified: number
  /** Max a user may withdraw per request once verified. `0` = no cap. */
  withdrawalMaxVerified: number
  /** Gateway used by deposit flows. */
  gateway: Gateway
  /** Payout target options shown on the withdrawal page. */
  payoutNetworks: PayoutNetwork[]
  /** Either 'mobile' (mobile-money number) or 'bank' (account number). */
  payoutTarget: 'mobile' | 'bank'
}

const COUNTRIES: Record<CountryCode, CountryConfig> = {
  GH: {
    code: 'GH',
    name: 'Ghana',
    flag: '🇬🇭',
    currency: 'GHS',
    currencySymbol: 'GHS',
    locale: 'en-GB',
    dialCode: '233',
    requiresKyc: true,
    kycLabel: 'Ghana Card number',
    kycPlaceholder: 'GHA-XXXXXXXXX-X',
    kycError: 'Ghana Card number is required (format: GHA-XXXXXXXXX-X)',
    minFirstDeposit: 200,
    verificationAmount: 200,
    verificationAmounts: [300, 300, 300, 300],
    withdrawalFee: 0,
    withdrawalMin: 1,
    withdrawalMaxUnverified: 20,
    withdrawalMaxVerified: 75000,
    // Manual mobile-money deposit — customer pays to 0509182654, operator/admin
    // confirms and credits.
    gateway: 'manual',
    payoutTarget: 'mobile',
    payoutNetworks: [
      { key: 'mtn', label: 'MTN MoMo' },
      { key: 'telecel', label: 'Telecel Cash' },
      { key: 'airteltigo', label: 'AirtelTigo Money' },
    ],
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    flag: '🇳🇬',
    currency: 'NGN',
    currencySymbol: '₦',
    locale: 'en-NG',
    dialCode: '234',
    requiresKyc: false,
    kycLabel: 'BVN or NIN',
    kycPlaceholder: '12345678901',
    kycError: 'BVN or NIN must be exactly 11 digits',
    minFirstDeposit: 30000,
    verificationAmount: 30000,
    withdrawalFee: 620,
    withdrawalMin: 1,
    withdrawalMaxUnverified: 0,
    withdrawalMaxVerified: 0,
    gateway: 'flutterwave',
    payoutTarget: 'bank',
    payoutNetworks: [
      { key: 'bank', label: 'Bank account' },
    ],
  },
  KE: {
    code: 'KE',
    name: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    currencySymbol: 'KSh',
    locale: 'en-KE',
    dialCode: '254',
    requiresKyc: true,
    kycLabel: 'National ID number',
    kycPlaceholder: '12345678',
    kycError: 'National ID must be 7 or 8 digits',
    minFirstDeposit: 2500,
    verificationAmount: 2500,
    withdrawalFee: 620,
    withdrawalMin: 1,
    withdrawalMaxUnverified: 0,
    withdrawalMaxVerified: 0,
    gateway: 'flutterwave',
    payoutTarget: 'mobile',
    payoutNetworks: [
      { key: 'mpesa', label: 'M-Pesa' },
      { key: 'airtel', label: 'Airtel Money' },
    ],
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    flag: '🇿🇦',
    currency: 'ZAR',
    currencySymbol: 'R',
    locale: 'en-ZA',
    dialCode: '27',
    requiresKyc: true,
    kycLabel: 'ID number',
    kycPlaceholder: '1234567890123',
    kycError: 'South African ID must be 13 digits',
    minFirstDeposit: 350,
    verificationAmount: 350,
    withdrawalFee: 620,
    withdrawalMin: 1,
    withdrawalMaxUnverified: 0,
    withdrawalMaxVerified: 0,
    gateway: 'flutterwave',
    payoutTarget: 'bank',
    payoutNetworks: [
      { key: 'bank', label: 'Bank account' },
    ],
  },
}

export const SUPPORTED_COUNTRY_CODES: CountryCode[] = ['GH', 'NG', 'KE', 'ZA']
export const SUPPORTED_CURRENCY_CODES: CurrencyCode[] = ['GHS', 'NGN', 'KES', 'ZAR']
export const DEFAULT_COUNTRY: CountryCode = 'GH'
export const DEFAULT_CURRENCY: CurrencyCode = 'GHS'

export function listCountries(): CountryConfig[] {
  return SUPPORTED_COUNTRY_CODES.map((c) => COUNTRIES[c])
}

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && (SUPPORTED_COUNTRY_CODES as string[]).includes(value)
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (SUPPORTED_CURRENCY_CODES as string[]).includes(value)
}

/**
 * Look up a country config. Falls back to Ghana when the code is missing or
 * unknown so legacy rows (created before the country column) keep rendering.
 */
export function getCountry(code: string | null | undefined): CountryConfig {
  if (code && isCountryCode(code)) return COUNTRIES[code]
  return COUNTRIES[DEFAULT_COUNTRY]
}

export function getCountryForCurrency(currency: CurrencyCode): CountryConfig {
  return listCountries().find((c) => c.currency === currency) ?? COUNTRIES[DEFAULT_COUNTRY]
}

export function currencyFromCountry(code: CountryCode): CurrencyCode {
  return COUNTRIES[code].currency
}

/**
 * Normalise a phone number to the local form (e.g. "0XXXXXXXXX" for GH/NG/KE,
 * 9-digit local form for ZA). Returns null if the input cannot be coerced into
 * the country's expected shape.
 */
export function normalizePhone(country: CountryCode, raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '')
  if (!cleaned) return null
  const cfg = COUNTRIES[country]
  const dial = cfg.dialCode
  // Strip leading +dial / dial / 0 so we can validate just the local digits.
  let local = cleaned
  if (local.startsWith('+' + dial)) local = local.slice(1 + dial.length)
  else if (local.startsWith(dial)) local = local.slice(dial.length)
  else if (local.startsWith('0')) local = local.slice(1)

  if (!/^\d+$/.test(local)) return null

  // Per-country length checks on the local (post-leading-zero) part:
  //   GH / KE  → 9 digits (so user-facing form is "0" + 9 digits)
  //   NG       → 10 digits
  //   ZA       → 9 digits
  const lengthsByCountry: Record<CountryCode, number[]> = {
    GH: [9],
    NG: [10],
    KE: [9],
    ZA: [9],
  }
  if (!lengthsByCountry[country].includes(local.length)) return null

  // GH/NG/KE display with a leading 0; ZA omits it (storage convention here is
  // "0" + local for the first three to match the existing GH format, plain
  // local for ZA so we don't break the SA display convention).
  if (country === 'ZA') return local
  return '0' + local
}

/**
 * Validate the KYC value supplied at signup. Returns the canonical (storage)
 * form on success or null on failure.
 */
export function normalizeKyc(country: CountryCode, raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  switch (country) {
    case 'GH': {
      const stripped = value.toUpperCase().replace(/[\s-]/g, '')
      if (!/^GHA\d{10}$/.test(stripped)) return null
      return `${stripped.slice(0, 3)}-${stripped.slice(3, 12)}-${stripped.slice(12)}`
    }
    case 'NG': {
      const digits = value.replace(/\D/g, '')
      return /^\d{11}$/.test(digits) ? digits : null
    }
    case 'KE': {
      const digits = value.replace(/\D/g, '')
      return /^\d{7,8}$/.test(digits) ? digits : null
    }
    case 'ZA': {
      const digits = value.replace(/\D/g, '')
      return /^\d{13}$/.test(digits) ? digits : null
    }
  }
}

export function getMinFirstDeposit(country: CountryCode): number {
  // Allow per-country env overrides:  MIN_FIRST_DEPOSIT_GH, MIN_FIRST_DEPOSIT_NG, ...
  const raw = process.env[`MIN_FIRST_DEPOSIT_${country}`]
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  return COUNTRIES[country].minFirstDeposit
}

export function getVerificationAmount(country: CountryCode): number {
  const raw = process.env[`VERIFICATION_AMOUNT_${country}`]
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  return COUNTRIES[country].verificationAmount
}

/**
 * Per-step required deposit amounts to unlock withdrawal. Length = number of
 * verification deposits. Uses the country's `verificationAmounts` if set, else
 * 4 deposits of the single `verificationAmount`.
 */
export function getVerificationSteps(country: CountryCode): number[] {
  const cfg = COUNTRIES[country]
  if (cfg.verificationAmounts && cfg.verificationAmounts.length > 0) {
    return cfg.verificationAmounts
  }
  const amount = getVerificationAmount(country)
  return [amount, amount, amount, amount]
}

export function getWithdrawalFee(country: CountryCode): number {
  // Allow per-country env overrides: WITHDRAWAL_FEE_GH, WITHDRAWAL_FEE_NG, ...
  const raw = process.env[`WITHDRAWAL_FEE_${country}`]
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  return COUNTRIES[country].withdrawalFee
}

/** Minimum single-withdrawal amount. Env override: WITHDRAWAL_MIN_GH, ... */
export function getWithdrawalMin(country: CountryCode): number {
  const raw = process.env[`WITHDRAWAL_MIN_${country}`]
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  return COUNTRIES[country].withdrawalMin
}

// Read a "0 allowed, empty falls back to default" env number.
function envCap(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return fallback
}

/**
 * Per-request withdrawal ceiling before verification. `0` means unverified
 * users can't withdraw at all. Env override: WITHDRAWAL_MAX_UNVERIFIED_GH, ...
 */
export function getWithdrawalMaxUnverified(country: CountryCode): number {
  return envCap(`WITHDRAWAL_MAX_UNVERIFIED_${country}`, COUNTRIES[country].withdrawalMaxUnverified)
}

/**
 * Per-request withdrawal ceiling once verified. `0` = no cap. Env override:
 * WITHDRAWAL_MAX_VERIFIED_GH, ...
 */
export function getWithdrawalMaxVerified(country: CountryCode): number {
  return envCap(`WITHDRAWAL_MAX_VERIFIED_${country}`, COUNTRIES[country].withdrawalMaxVerified)
}

/** Resolve the applicable per-request cap for a user. `0` = no cap. */
export function getWithdrawalMax(country: CountryCode, verified: boolean): number {
  return verified ? getWithdrawalMaxVerified(country) : getWithdrawalMaxUnverified(country)
}
