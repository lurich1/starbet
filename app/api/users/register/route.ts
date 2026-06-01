import { NextResponse } from 'next/server'
import { addUser, findUserByEmail } from '@/lib/users-store'
import { findSubAdminByReferralCode } from '@/lib/sub-admins-store'
import { hashPassword } from '@/lib/password'
import {
  currencyFromCountry,
  DEFAULT_COUNTRY,
  getCountry,
  isCountryCode,
  normalizeKyc,
  normalizePhone,
  type CountryCode,
} from '@/lib/countries'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: {
    name?: string
    email?: string
    password?: string
    phone?: string
    country?: string
    /** Country-specific KYC value (Ghana Card, BVN/NIN, Kenyan/SA ID). */
    kyc?: string
    /** Legacy alias kept so older clients still work for Ghana signups. */
    ghanaCard?: string
    referralCode?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const referralCode = (body.referralCode ?? '').trim().toUpperCase()
  const countryInput = (body.country ?? DEFAULT_COUNTRY).toString().toUpperCase()

  if (!isCountryCode(countryInput)) {
    return NextResponse.json(
      { error: 'country must be one of GH, NG, KE, ZA' },
      { status: 400 },
    )
  }
  const country: CountryCode = countryInput
  const cfg = getCountry(country)

  const phone = normalizePhone(country, body.phone ?? '')
  if (!phone) {
    return NextResponse.json(
      { error: `phone must be a valid ${cfg.name} number` },
      { status: 400 },
    )
  }

  const rawKyc = (body.kyc ?? body.ghanaCard ?? '').toString()
  let kycId: string | null = null
  if (cfg.requiresKyc) {
    kycId = normalizeKyc(country, rawKyc)
    if (!kycId) {
      return NextResponse.json({ error: cfg.kycError }, { status: 400 })
    }
  } else if (rawKyc.trim()) {
    // KYC isn't required for this country, but if the client sent one anyway
    // (older builds, multi-country forms) keep it if it validates — otherwise drop it.
    kycId = normalizeKyc(country, rawKyc)
  }

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: 'name, email, phone, KYC, and password are required' },
      { status: 400 },
    )
  }
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'password must be at least 6 characters' },
      { status: 400 },
    )
  }

  if (await findUserByEmail(email)) {
    return NextResponse.json(
      { error: 'a user with that email already exists' },
      { status: 409 },
    )
  }

  let referredBySubAdminId: string | undefined = undefined
  let validatedReferralCode: string | undefined = undefined
  if (referralCode) {
    const sa = await findSubAdminByReferralCode(referralCode)
    if (!sa) {
      return NextResponse.json({ error: 'invalid referral code' }, { status: 400 })
    }
    if (!sa.approved) {
      return NextResponse.json(
        { error: 'this referral code is currently disabled' },
        { status: 400 },
      )
    }
    referredBySubAdminId = sa.id
    validatedReferralCode = sa.referralCode
  }

  const user = await addUser({
    name,
    email,
    passwordHash: hashPassword(password),
    phone,
    country,
    currency: currencyFromCountry(country),
    kycId: kycId ?? undefined,
    // Maintain the dedicated ghanaCard column for GH users so existing admin
    // tooling that still reads `ghana_card` continues to display the value.
    ghanaCard: country === 'GH' ? (kycId ?? undefined) : undefined,
    referredByCode: validatedReferralCode,
    referredBySubAdminId,
  })

  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        country: user.country,
        currency: user.currency,
        referredByCode: user.referredByCode,
        hasFirstDeposit: !!user.firstDepositAt,
      },
    },
    { status: 201 },
  )
}
