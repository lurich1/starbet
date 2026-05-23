// One-shot: verifies whether custom_matches.locked exists. Adds it via a
// direct insert+upsert workaround if the column is missing — actually we
// can't run DDL via supabase-js, so we just probe and report. Run the
// SQL in 0007_custom_match_locked.sql via the dashboard if missing.
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
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { error } = await s.from('custom_matches').select('locked').limit(1)
if (error) {
  console.log('MISSING:', error.message)
  console.log('Run this in the Supabase SQL editor:')
  console.log("alter table custom_matches add column if not exists locked boolean not null default false;")
  process.exit(1)
}
console.log('OK: custom_matches.locked column exists.')
