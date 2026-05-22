// One-shot script: creates the `team-flags` Storage bucket (public) using
// the service-role key from .env.local. Safe to re-run — exits gracefully
// if the bucket already exists.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const BUCKET = 'team-flags'

const { data: existing, error: listErr } = await supabase.storage.listBuckets()
if (listErr) {
  console.error('listBuckets failed:', listErr.message)
  process.exit(1)
}
if (existing.some((b) => b.name === BUCKET)) {
  console.log(`Bucket "${BUCKET}" already exists — nothing to do.`)
  process.exit(0)
}

const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
  public: true,
  fileSizeLimit: 1_000_000,
  allowedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/svg+xml',
    'image/gif',
  ],
})
if (createErr) {
  console.error('createBucket failed:', createErr.message)
  process.exit(1)
}
console.log(`Created public bucket "${BUCKET}" with 1 MB limit, image MIMEs only.`)
