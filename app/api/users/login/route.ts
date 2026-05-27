import { NextResponse } from 'next/server'
import { findUserByEmail, findUserByPhone } from '@/lib/users-store'
import { verifyPassword } from '@/lib/password'

export const dynamic = 'force-dynamic'

// Accept any of: 0244XXXXXXX, 233244XXXXXXX, +233244XXXXXXX. Returns the
// 10-digit local format (the same shape stored on the users table).
function normalizePhone(raw: string): string | null {
  const s = raw.replace(/\s|-/g, '')
  let local = s
  if (s.startsWith('+233')) local = '0' + s.slice(4)
  else if (s.startsWith('233')) local = '0' + s.slice(3)
  return /^0\d{9}$/.test(local) ? local : null
}

function looksLikePhone(s: string): boolean {
  // Cheap discriminator: phones are all-digits (or start with +/233/0). Emails
  // always contain '@'. We don't have to be perfect — we fall back to email
  // lookup if phone lookup returns nothing.
  return /^[+\d\s-]+$/.test(s)
}

export async function POST(request: Request) {
  let body: { email?: string; identifier?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Back-compat: existing client still sends `email`. Newer client sends
  // `identifier` (which may be either an email or a phone number).
  const raw = (body.identifier ?? body.email ?? '').trim()
  const password = body.password ?? ''

  if (!raw || !password) {
    return NextResponse.json(
      { error: 'email or phone and password are required' },
      { status: 400 },
    )
  }

  let user = null
  if (looksLikePhone(raw)) {
    const phone = normalizePhone(raw)
    if (phone) user = await findUserByPhone(phone)
  }
  if (!user) {
    user = await findUserByEmail(raw.toLowerCase())
  }

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: 'invalid email/phone or password' },
      { status: 401 },
    )
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      totalDeposited: user.totalDeposited,
    },
  })
}
