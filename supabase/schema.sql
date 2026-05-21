-- ============================================================================
-- PrimeBet — Supabase schema
-- ----------------------------------------------------------------------------
-- Paste this whole file into Supabase Studio → SQL editor → New query → Run.
-- It's idempotent: every CREATE uses "IF NOT EXISTS" so you can re-run safely.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

-- ============================================================================
-- 1. SUB-ADMINS (partner / referral accounts)
-- ============================================================================
create table if not exists public.sub_admins (
    id                       uuid primary key default gen_random_uuid(),
    name                     text not null check (char_length(name) between 2 and 120),
    email                    citext not null unique,
    password_hash            text not null,
    referral_code            text not null unique check (referral_code = upper(referral_code)),
    approved                 boolean not null default false,
    commission_balance       numeric(18, 2) not null default 0 check (commission_balance >= 0),
    total_commission_earned  numeric(18, 2) not null default 0 check (total_commission_earned >= 0),
    created_at               timestamptz not null default now()
);

create index if not exists idx_sub_admins_referral_code on public.sub_admins (referral_code);

-- ============================================================================
-- 2. USERS (players)
-- ============================================================================
create table if not exists public.users (
    id                       uuid primary key default gen_random_uuid(),
    name                     text not null check (char_length(name) between 2 and 120),
    email                    citext not null unique,
    password_hash            text not null,
    referred_by_code         text,
    referred_by_sub_admin_id uuid references public.sub_admins(id) on delete set null,
    first_deposit_amount     numeric(18, 2) not null default 0 check (first_deposit_amount >= 0),
    first_deposit_at         timestamptz,
    total_deposited          numeric(18, 2) not null default 0 check (total_deposited >= 0),
    total_withdrawn          numeric(18, 2) not null default 0 check (total_withdrawn >= 0),
    balance                  numeric(18, 2) not null default 0,
    -- 2-step withdrawal verification: 0 = none, 1 = first 200 paid, 2 = fully verified
    verification_step        integer not null default 0
                             check (verification_step between 0 and 2),
    created_at               timestamptz not null default now()
);

create index if not exists idx_users_referred_by on public.users (referred_by_sub_admin_id);
create index if not exists idx_users_created_at on public.users (created_at desc);

-- ============================================================================
-- 3. COMMISSIONS (one row per first-deposit referral payout)
-- ============================================================================
create table if not exists public.commissions (
    id                uuid primary key default gen_random_uuid(),
    sub_admin_id      uuid not null references public.sub_admins(id) on delete cascade,
    user_id           uuid not null references public.users(id) on delete cascade,
    deposit_amount    numeric(18, 2) not null check (deposit_amount > 0),
    commission_amount numeric(18, 2) not null check (commission_amount > 0),
    rate              numeric(6, 4) not null check (rate > 0 and rate <= 1),
    created_at        timestamptz not null default now()
);

create index if not exists idx_commissions_sub_admin on public.commissions (sub_admin_id, created_at desc);
create index if not exists idx_commissions_user on public.commissions (user_id);

-- ============================================================================
-- 4. BETS (parent record per ticket)
-- ============================================================================
create table if not exists public.bets (
    id             uuid primary key default gen_random_uuid(),
    code           text not null unique check (code = upper(code)),
    user_id        uuid references public.users(id) on delete set null,
    placed_at      timestamptz not null default now(),
    stake          numeric(18, 2) not null check (stake > 0),
    total_odds     numeric(18, 4) not null check (total_odds >= 1),
    potential_win  numeric(18, 2) not null check (potential_win >= 0),
    status         text not null default 'pending'
                   check (status in ('pending', 'won', 'lost')),
    settled_at     timestamptz,
    payout         numeric(18, 2) check (payout is null or payout >= 0)
);

create index if not exists idx_bets_user on public.bets (user_id, placed_at desc);
create index if not exists idx_bets_status on public.bets (status, placed_at desc);

-- ============================================================================
-- 5. BET_SELECTIONS (line items of each ticket)
-- ============================================================================
create table if not exists public.bet_selections (
    id             uuid primary key default gen_random_uuid(),
    bet_id         uuid not null references public.bets(id) on delete cascade,
    match_id       text not null,
    home_team      text not null default '',
    away_team      text not null default '',
    league         text not null default '',
    country        text not null default '',
    market_key     text not null,
    market_label   text not null default '',
    outcome_key    text not null,
    outcome_label  text not null default '',
    odds           numeric(18, 4) not null check (odds >= 1),
    -- Per-leg result so the bet card can colour each match green/red
    status         text not null default 'pending'
                   check (status in ('pending', 'won', 'lost'))
);

create index if not exists idx_bet_selections_bet on public.bet_selections (bet_id);
create index if not exists idx_bet_selections_status on public.bet_selections (bet_id, status);

-- ============================================================================
-- 6. CUSTOM_MATCHES (admin-added matches)
-- ============================================================================
create table if not exists public.custom_matches (
    id              uuid primary key default gen_random_uuid(),
    sport           text not null default 'football',
    league          text not null,
    country         text not null default '',
    home_team       text not null,
    away_team       text not null,
    home_score      integer,
    away_score      integer,
    minute          text,
    minute_set_at   timestamptz,
    start_time      text,
    start_time_utc  timestamptz,
    is_live         boolean not null default false,
    odds_home       numeric(10, 2) not null check (odds_home >= 1),
    odds_draw       numeric(10, 2) not null default 0 check (odds_draw >= 0),
    odds_away       numeric(10, 2) not null check (odds_away >= 1),
    created_at      timestamptz not null default now()
);

create index if not exists idx_custom_matches_sport on public.custom_matches (sport, created_at desc);
create index if not exists idx_custom_matches_live on public.custom_matches (is_live) where is_live = true;

-- ============================================================================
-- 7. PAYMENTS (Korapay deposit log — one row per attempted payment)
-- ============================================================================
create table if not exists public.payments (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid references public.users(id) on delete set null,
    reference    text not null unique,
    amount       numeric(18, 2) not null check (amount > 0),
    currency     text not null default 'GHS',
    provider     text not null default 'korapay',
    status       text not null default 'pending'
                 check (status in ('pending', 'success', 'failed', 'cancelled')),
    metadata     jsonb,
    created_at   timestamptz not null default now(),
    verified_at  timestamptz
);

create index if not exists idx_payments_user on public.payments (user_id, created_at desc);
create index if not exists idx_payments_status on public.payments (status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- All access goes through the Next.js server using the SERVICE ROLE key,
-- which bypasses RLS. RLS is still enabled with conservative deny-by-default
-- policies so that the anon key — which ships to the browser — can't read
-- anything sensitive. Tighten / open up as needed.
-- ============================================================================

alter table public.sub_admins      enable row level security;
alter table public.users           enable row level security;
alter table public.commissions     enable row level security;
alter table public.bets            enable row level security;
alter table public.bet_selections  enable row level security;
alter table public.custom_matches  enable row level security;
alter table public.payments        enable row level security;

-- Public can read live / upcoming custom matches (used by the public matches API).
drop policy if exists "anon read custom matches" on public.custom_matches;
create policy "anon read custom matches" on public.custom_matches
    for select to anon
    using (true);

-- Everything else: no anon access. Service role bypasses these by design.

-- ============================================================================
-- HELPER VIEW (optional) — for the /api/admin/stats endpoint
-- ============================================================================
create or replace view public.admin_stats as
select
    (select count(*) from public.users)                                  as total_users,
    (select count(*) from public.bets)                                   as total_bets,
    (select count(*) from public.bets where status = 'pending')          as pending_bets,
    (select count(*) from public.sub_admins)                             as total_sub_admins,
    (select count(*) from public.custom_matches)                         as total_custom_matches,
    (select coalesce(sum(total_deposited), 0) from public.users)         as total_deposited,
    (select coalesce(sum(total_withdrawn), 0) from public.users)         as total_withdrawn,
    (select coalesce(sum(total_commission_earned), 0) from public.sub_admins) as total_commissions_paid;
