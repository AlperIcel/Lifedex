-- ============================================================
-- LifeDex — Row Level Security Policies
-- Run AFTER schema.sql.
-- Principle: least privilege. Default-deny, explicit allow.
-- ============================================================

-- ============================================================
-- profiles
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- A user can read their own profile.
CREATE POLICY "profiles: owner read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- A user can insert their own profile row (used in onboarding trigger).
CREATE POLICY "profiles: owner insert"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- A user can update their own profile (username, avatar_url).
-- XP and level updates are done via service-role functions, not direct client writes,
-- but we allow client writes here too so the mock path works without service role.
CREATE POLICY "profiles: owner update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Leaderboard: anyone (authenticated) may read username + xp + level.
-- We do NOT expose email or private fields via this policy — those aren't on profiles.
CREATE POLICY "profiles: public read username+xp+level"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- NOTE: the two SELECT policies above are additive — Supabase ORs them.
-- The net effect: authenticated users can see all profiles' public fields;
-- each user can additionally see their own full row.

-- ============================================================
-- sightings
-- PRIVACY CRITICAL:
--   • original_image_path: only the owning user may ever retrieve it
--   • private_location: only the owning user may ever retrieve it
--   • public_card_image_path + public_location: readable by all IF
--     moderation_status='allowed' AND location_hidden=FALSE
-- We enforce column-level privacy by exposing two views below;
-- direct table SELECT is restricted to the owner only.
-- ============================================================

ALTER TABLE sightings ENABLE ROW LEVEL SECURITY;

-- Owner: full read/write on their own sightings (includes private fields).
CREATE POLICY "sightings: owner read"
  ON sightings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sightings: owner insert"
  ON sightings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sightings: owner update"
  ON sightings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sightings: owner delete"
  ON sightings FOR DELETE
  USING (auth.uid() = user_id);

-- Public: other authenticated users may read only the safe public subset.
-- Enforced via a security-definer view (public_sightings) below.
-- The base table stays owner-only for direct SELECT.

-- ============================================================
-- Public sightings view — no private coords, no original photo
-- ============================================================
CREATE OR REPLACE VIEW public_sightings
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.user_id,
  p.username,
  s.detected_category,
  s.detected_species,
  s.scientific_name,
  s.rarity,
  s.xp_awarded,
  s.captive_status,
  s.sensitivity,
  s.is_sensitive,
  s.is_zoo_captive,
  -- Public location: expose only when not hidden
  CASE WHEN s.location_hidden THEN NULL
       ELSE ST_AsGeoJSON(s.public_location)::JSONB
  END AS public_location_geojson,
  s.location_precision_m,
  s.location_hidden,
  s.public_card_image_path,
  s.card_metadata,
  s.moderation_status,
  s.created_at
FROM sightings s
JOIN profiles p ON p.id = s.user_id
WHERE s.moderation_status = 'allowed';
-- NOTE: original_image_path and private_location are intentionally excluded.

-- ============================================================
-- collection_cards
-- ============================================================

ALTER TABLE collection_cards ENABLE ROW LEVEL SECURITY;

-- Owner: full access to their own collection.
CREATE POLICY "collection_cards: owner read"
  ON collection_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "collection_cards: owner insert"
  ON collection_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "collection_cards: owner update"
  ON collection_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "collection_cards: owner delete"
  ON collection_cards FOR DELETE
  USING (auth.uid() = user_id);

-- Public: authenticated users may browse other players' cards
-- (card image + species name only — no private sighting data).
-- Exposed via the public_collection_cards view below.

CREATE OR REPLACE VIEW public_collection_cards
WITH (security_invoker = true)
AS
SELECT
  cc.id,
  cc.user_id,
  p.username,
  cc.species_name,
  cc.category,
  cc.best_rarity,
  cc.sighting_count,
  cc.public_card_image_path,
  cc.card_metadata,
  cc.first_seen_at
FROM collection_cards cc
JOIN profiles p ON p.id = cc.user_id;

-- ============================================================
-- species_rules — readable by all authenticated users, no writes
-- ============================================================

ALTER TABLE species_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "species_rules: authenticated read"
  ON species_rules FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserts/updates only via service role (migrations / admin panel).

-- ============================================================
-- moderation_events — owner read only (audit trail)
-- Writes only via service role or Edge Functions.
-- ============================================================

ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "moderation_events: owner read"
  ON moderation_events FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- Supabase Storage bucket policies (declarative SQL form)
-- Bucket names: 'private-photos'  (private)
--               'card-images'     (public)
-- ============================================================

-- private-photos: read/write only by the file owner.
-- Path convention: private-photos/{user_id}/{sighting_id}/photo.jpg
-- Enforced by checking storage.foldername(name)[1] = auth.uid()::text.

-- (Run these after creating the buckets in the Supabase dashboard or via SQL below)

-- Create buckets (idempotent via DO block)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('private-photos', 'private-photos', FALSE, 20971520,  -- 20 MB
   ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('card-images',    'card-images',    TRUE,  5242880,   -- 5 MB
   ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- private-photos: only the owning user may read or write
CREATE POLICY "private-photos: owner read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'private-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "private-photos: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'private-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "private-photos: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'private-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "private-photos: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'private-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- card-images: public read (bucket is public), authenticated write by owner
CREATE POLICY "card-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-images');

CREATE POLICY "card-images: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'card-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "card-images: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'card-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
