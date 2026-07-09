import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isValidSessionCookie } from '@/lib/admin-auth'
import { resetAllCommissions } from '@/lib/sub-admins-store'

export const dynamic = 'force-dynamic'

async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies()
  return isValidSessionCookie(store.get(ADMIN_COOKIE)?.value)
}

// Admin-only, destructive: delete all commission history and zero every
// sub-admin's payable balances. Body `{ keepLifetime: true }` preserves the
// lifetime "total earned" figures.
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let keepLifetime = false
  try {
    const body = await request.json()
    keepLifetime = body?.keepLifetime === true
  } catch {
    // empty body is fine — default full reset
  }

  try {
    const { deleted } = await resetAllCommissions({ keepLifetime })
    return NextResponse.json({ ok: true, deleted, keepLifetime })
  } catch (e) {
    console.error('[admin/commissions/reset] failed:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'reset failed' },
      { status: 500 },
    )
  }
}
