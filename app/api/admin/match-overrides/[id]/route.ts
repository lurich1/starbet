import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isValidSessionCookie } from '@/lib/admin-auth'
import {
  upsertMatchOverride,
  deleteMatchOverride,
  type MatchOverridePatch,
} from '@/lib/match-overrides-store'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

async function requireAdmin(): Promise<NextResponse | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  if (!(await isValidSessionCookie(token))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * PATCH /api/admin/match-overrides/[id]
 * Upserts an admin override for the given match id (works on both Odds API
 * matches and custom matches). Pass null to clear an individual field.
 */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  let body: MatchOverridePatch & { match_id?: never }
  try {
    body = (await request.json()) as MatchOverridePatch
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const patch: MatchOverridePatch = {}
  if (body.homeScore !== undefined) patch.homeScore = body.homeScore
  if (body.awayScore !== undefined) patch.awayScore = body.awayScore
  if (body.minute !== undefined) patch.minute = body.minute
  if (body.isLive !== undefined) patch.isLive = body.isLive
  if (body.locked !== undefined) patch.locked = body.locked
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 })
  }
  const updated = await upsertMatchOverride(id, patch)
  return NextResponse.json({ override: updated })
}

/** Removes the override row entirely — match reverts to its API/custom values. */
export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  await deleteMatchOverride(id)
  return NextResponse.json({ ok: true })
}
