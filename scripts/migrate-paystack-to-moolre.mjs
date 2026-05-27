// One-shot: rewrite payments.provider='paystack' rows to 'moolre' so the
// legacy gateway name doesn't surface in the UI. Idempotent — re-running
// is a no-op once the column is clean.
//
// Usage: node scripts/migrate-paystack-to-moolre.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { count: before } = await s
  .from('payments')
  .select('id', { count: 'exact', head: true })
  .eq('provider', 'paystack')

console.log(`Found ${before ?? 0} payments row(s) with provider='paystack'.`)

if (!before) {
  console.log('Nothing to migrate.')
  process.exit(0)
}

const { error } = await s
  .from('payments')
  .update({ provider: 'moolre' })
  .eq('provider', 'paystack')

if (error) {
  console.error('UPDATE failed:', error.message)
  process.exit(1)
}

const { count: after } = await s
  .from('payments')
  .select('id', { count: 'exact', head: true })
  .eq('provider', 'paystack')

console.log(`Done. paystack rows remaining: ${after ?? 0}`)
