-- LifeDex — community sightings (public, shareable layer).
--
-- Stores ONLY privacy-safe data: the AI card, fuzzed location, species + rarity.
-- The original photo and the EXACT GPS point are never sent here — they stay on
-- the device. Run this once in the Supabase SQL editor.

create table if not exists public.community_sightings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  category           text not null,
  common_name        text not null,
  scientific_name    text,
  rarity             text not null,
  xp                 integer not null default 0,
  captive_status     text not null default 'unknown',
  sensitivity        text not null default 'none',
  public_image_uri   text not null,
  public_lat         double precision,
  public_lng         double precision,
  public_precision_m integer not null default 0,
  location_hidden    boolean not null default false,
  card               jsonb not null default '{}'::jsonb
);

create index if not exists community_sightings_created_idx
  on public.community_sightings (created_at desc);
create index if not exists community_sightings_user_idx
  on public.community_sightings (user_id);

-- Row Level Security ------------------------------------------------------------
alter table public.community_sightings enable row level security;

-- Public read: the community feed is visible to everyone (including anonymous).
-- Only public-safe columns exist on this table, so reading any row is safe.
drop policy if exists "community read" on public.community_sightings;
create policy "community read"
  on public.community_sightings
  for select
  using (true);

-- Insert only rows owned by the signed-in (anonymous) user.
drop policy if exists "insert own" on public.community_sightings;
create policy "insert own"
  on public.community_sightings
  for insert
  with check (auth.uid() = user_id);

-- Update / delete only your own rows.
drop policy if exists "update own" on public.community_sightings;
create policy "update own"
  on public.community_sightings
  for update
  using (auth.uid() = user_id);

drop policy if exists "delete own" on public.community_sightings;
create policy "delete own"
  on public.community_sightings
  for delete
  using (auth.uid() = user_id);
