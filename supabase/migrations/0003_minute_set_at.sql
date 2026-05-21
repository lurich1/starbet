-- Ticking minute support for custom live matches.
-- We store the minute as the admin entered it ("45'") plus a timestamp of
-- when they entered it. The read-side computes the current minute as
--   stored_minute + floor((now - minute_set_at) / 60_000)
-- so the displayed clock keeps moving without further admin input.
-- If the admin updates the minute later, both columns are bumped and the
-- clock continues from there.

alter table public.custom_matches
    add column if not exists minute_set_at timestamptz;

-- Backfill: anything currently marked live gets minute_set_at = created_at
-- so it doesn't tick from epoch. Anything finished/upcoming stays null.
update public.custom_matches
   set minute_set_at = created_at
 where is_live = true and minute_set_at is null;
