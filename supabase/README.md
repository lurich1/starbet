# Supabase setup for PrimeBet

Your project URL: <https://doqlicdyzblveoryqhel.supabase.co>

## 1. Create the tables

1. Open <https://supabase.com/dashboard/project/doqlicdyzblveoryqhel/sql/new>
2. Open `supabase/schema.sql` from this repo, copy the whole file
3. Paste into the SQL editor and click **Run**
4. You should see "Success. No rows returned."

The script is **idempotent** — every `CREATE` uses `IF NOT EXISTS`, so re-running it won't drop data or fail.

## 2. Grab the keys

In Supabase Studio → **Project Settings** → **API**, copy:

| Variable | Where to use it |
| --- | --- |
| **Project URL** | already known: `https://doqlicdyzblveoryqhel.supabase.co` |
| **anon public** | safe in browser (RLS enforces access) |
| **service_role secret** | server only — bypasses RLS |

Add to `.env.local` (local) and to Vercel env vars (production):

```env
NEXT_PUBLIC_SUPABASE_URL=https://doqlicdyzblveoryqhel.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Never commit the service role key — it gives full read/write on every table.

## 3. What got created

| Table | Purpose |
| --- | --- |
| `users` | Players. Email/password hash + balance / total deposited / total withdrawn. |
| `sub_admins` | Partners with unique referral codes. Approved flag + commission balances. |
| `commissions` | One row per first-deposit referral payout. |
| `bets` | Bet tickets (code + stake + total odds + status). |
| `bet_selections` | Line items inside each ticket. Cascade-deleted with the bet. |
| `custom_matches` | Admin-added matches that show up alongside the Odds API feed. |
| `payments` | Korapay deposit log: reference, amount, status, metadata. Catches duplicates by unique `reference`. |
| `admin_stats` *(view)* | Pre-rolled counts + totals for the admin dashboard. |

## 4. Row Level Security

RLS is **enabled** on every table. The only `anon`-readable thing right now is `custom_matches` (so the public matches API can show admin-added games even when the Odds API is rate-limited).

Everything else expects requests using the **service role key**, which bypasses RLS. The Next.js server-side routes (`/app/api/...`) are where that key gets used.

If you later want logged-in players to query their own data directly from the browser, add policies like:

```sql
create policy "users read self" on public.users
  for select to authenticated
  using (id = auth.uid());
```

That assumes you wire user records to Supabase's built-in `auth.users` table — separate decision. For now the app does its own bcrypt-based auth, so `auth.uid()` isn't populated, and everything flows through the server.

## 5. Next step — wire the app to Supabase

Once you've added the env vars, I can swap `lib/users-store.ts`, `lib/bets-store.ts`, `lib/sub-admins-store.ts`, `lib/custom-matches-store.ts` from JSON-file storage to `@supabase/supabase-js` calls. Endpoints stay the same; data moves from `./data/*.json` into Supabase.

Send me the two keys (anon + service role) when you have them and I'll do the swap.
