import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')]}))
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
// 1. Columns
const { error: colErr } = await s.from('custom_matches').select('home_flag_url,away_flag_url').limit(1)
console.log('custom_matches columns:', colErr ? 'MISSING — '+colErr.message : 'OK')
// 2. Bucket
const { data: buckets, error: bErr } = await s.storage.listBuckets()
if (bErr) { console.log('bucket list FAILED:', bErr.message); process.exit(1) }
const tf = buckets.find(b => b.name === 'team-flags')
console.log('team-flags bucket:', tf ? `OK (public=${tf.public})` : 'MISSING')
