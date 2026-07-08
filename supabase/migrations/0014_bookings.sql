-- 0014_bookings.sql
-- Shareable "Book Bet" codes. A booking is just a saved slip (selections) with a
-- short code — no stake, no user — so anyone can load someone else's selections
-- into their own bet slip. Distinct from `bets` (which requires stake > 0), so a
-- booking can't be settled or counted as a real ticket.

create table if not exists public.bookings (
    id          uuid primary key default gen_random_uuid(),
    code        text not null unique check (code = upper(code)),
    selections  jsonb not null,
    created_at  timestamptz not null default now()
);

create index if not exists idx_bookings_code on public.bookings (code);

alter table public.bookings enable row level security;
-- No policies: only the service-role key (server-side) touches this table, and
-- the service role bypasses RLS. Anon/auth clients get no direct access.
