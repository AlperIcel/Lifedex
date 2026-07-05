-- LifeDex — add an optional display username to community sightings so the
-- leaderboard can show names instead of anonymous ids. Safe to run anytime.
alter table public.community_sightings
  add column if not exists username text;
