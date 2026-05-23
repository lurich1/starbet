-- Admin-controlled manual lock for custom matches.
-- When true, getBettingState() in lib/match-betting.ts reports the match as
-- closed regardless of isLive / startTime — used to stop bets at any moment.

alter table custom_matches
  add column if not exists locked boolean not null default false;
