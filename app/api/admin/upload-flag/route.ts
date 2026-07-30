import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isValidSessionCookie } from '@/lib/admin-auth'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'team-flags'
const MAX_BYTES = 1_000_000 // 1 MB — keeps the storage bill small
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
])

export async function POST(request: Request) {
  // Admin-only
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  if (!(await isValidSessionCookie(token))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${(file.size / 1024).toFixed(0)} KB, max 1000 KB)` },
      { status: 400 },
    )
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type}` },
      { status: 400 },
    )
  }

  // Derive a filesystem-safe extension. SVG keeps its extension so it renders.
  const extFromName = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : ''
  const ext = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(extFromName)
    ? extFromName
    : file.type === 'image/svg+xml'
      ? 'svg'
      : file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : file.type === 'image/gif'
              ? 'gif'
              : 'bin'

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const supabase = supabaseServer()
  const doUpload = () =>
    supabase.storage.from(BUCKET).upload(key, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  let { error: uploadErr } = await doUpload()

  // Self-heal: the public `team-flags` bucket is normally created by
  // scripts/create-team-flags-bucket.mjs, but if that step was skipped the
  // first upload fails with "Bucket not found". Create it (public) and retry
  // once so the admin never has to run the script by hand.
  if (uploadErr && /bucket not found/i.test(uploadErr.message)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_MIME),
    })
    // Ignore "already exists" races — another request may have just made it.
    if (createErr && !/already exists/i.test(createErr.message)) {
      return NextResponse.json(
        { error: `could not create storage bucket: ${createErr.message}` },
        { status: 500 },
      )
    }
    ;({ error: uploadErr } = await doUpload())
  }

  if (uploadErr) {
    return NextResponse.json(
      { error: `upload failed: ${uploadErr.message}` },
      { status: 500 },
    )
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
  return NextResponse.json({ url: data.publicUrl, key })
}
