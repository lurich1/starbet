-- Admin-set overrides for ANY match (Odds API or custom). Each row keys off
-- the public match id; the merge layer in /api/matches overlays these values
-- on top of whatever the upstream source returned, so admin can fix scores
-- or lock a game when the API hasn't caught up.

create table if not exists match_overrides (
  match_id     text primary key,
  home_score   integer,
  away_score   integer,
  minute       text,
  is_live      boolean,
  locked       boolean not null default false,
  updated_at   timestamptz not null default now()
);

create index if not exists match_overrides_updated_at_idx
  on match_overrides (updated_at desc);
