# Supabase setup (community sightings)

The app connects to Supabase when `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set in
`.env` (already done locally). Two one-time steps in the Supabase dashboard make
the community layer work:

## 1. Create the table + RLS

1. Open your project → **SQL Editor** → **New query**.
2. Paste the entire contents of [`community_sightings.sql`](./community_sightings.sql).
3. Run it. This creates `public.community_sightings` with Row Level Security:
   - anyone can **read** the feed (public-safe columns only),
   - a user can **insert/update/delete only their own** rows.

## 2. Enable anonymous sign-in

The app signs each device in anonymously (no login screen yet) so RLS has a
`user_id`.

1. Go to **Authentication → Sign In / Providers** (or **Providers**).
2. Enable **Anonymous sign-ins**. Save.

## What is stored where

| Data | Location |
|---|---|
| Original photo (private evidence) | **Device only** (never uploaded) |
| Exact GPS point | **Device only** |
| Full sighting record | **Device** (AsyncStorage) |
| AI card, fuzzed location, species, rarity, XP | **Supabase** `community_sightings` (public) |

Captures are written locally **and** pushed to Supabase. The Map merges other
users' public sightings on top of your own local ones.

## Verify

- Capture something in the app, then open Supabase → **Table editor →
  community_sightings**: a new row should appear.
- The Map shows a `🌍 N` badge counting community sightings from other users.

If anonymous sign-in is **not** enabled, the app logs a warning and keeps working
fully local — nothing breaks; the community feed is just empty.
