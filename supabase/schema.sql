-- ============================================================
-- LifeDex — Database Schema
-- Requires: pgcrypto, postgis extensions
-- Run order: schema.sql → policies.sql → seed.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- Custom Enum types (mirror src/domain/types.ts)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE rarity_t AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE category_t AS ENUM ('animal', 'plant', 'tree', 'mushroom', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE captive_status_t AS ENUM ('wild', 'domestic', 'zoo_captive', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sensitivity_t AS ENUM ('none', 'low', 'sensitive', 'protected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status_t AS ENUM ('pending', 'allowed', 'blocked', 'stripped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- profiles
-- Mirrors ProfileSchema: id, username, xp, level
-- Linked 1-to-1 with auth.users via id.
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT NOT NULL UNIQUE,
  xp            INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level         INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-bump updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- species_rules
-- Mirrors SpeciesRuleSchema: speciesName, category, baseRarity,
-- sensitivity, publicPrecisionMeters, xpMultiplier
-- Seeded via seed.sql; readable by all authenticated users.
-- ============================================================

CREATE TABLE IF NOT EXISTS species_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species_name            TEXT NOT NULL UNIQUE,
  category                category_t NOT NULL,
  base_rarity             rarity_t NOT NULL,
  sensitivity             sensitivity_t NOT NULL DEFAULT 'none',
  public_precision_meters INTEGER NOT NULL DEFAULT 500 CHECK (public_precision_meters >= 0),
  xp_multiplier           NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (xp_multiplier > 0),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- sightings
-- Core table. Mirrors SightingSchema fields.
-- PRIVACY CONTRACT:
--   • original_image_path  — private Supabase Storage path, NEVER public
--   • private_location     — exact GPS, NEVER public
--   • public_card_image_path + public_location — can be shown publicly
--     subject to sensitivity/hidden rules
-- ============================================================

CREATE TABLE IF NOT EXISTS sightings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Classification (mirrors RecognitionResult)
  detected_category       category_t NOT NULL,
  detected_species        TEXT NOT NULL,          -- commonName
  scientific_name         TEXT,
  confidence              NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  captive_status          captive_status_t NOT NULL DEFAULT 'unknown',
  sensitivity             sensitivity_t NOT NULL DEFAULT 'none',
  is_sensitive            BOOLEAN GENERATED ALWAYS AS (sensitivity IN ('sensitive','protected')) STORED,
  is_zoo_captive          BOOLEAN GENERATED ALWAYS AS (captive_status = 'zoo_captive') STORED,

  -- Scoring (mirrors ScoreResult)
  rarity                  rarity_t NOT NULL,
  xp_awarded              INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),

  -- PRIVATE evidence — locked down by RLS
  original_image_path     TEXT NOT NULL,          -- privatePhotoUri → Supabase Storage path
  private_location        GEOGRAPHY(POINT, 4326), -- exact GPS, never queried publicly

  -- PUBLIC card data
  public_card_image_path  TEXT,                   -- AI-generated card image path / CDN url
  public_location         GEOGRAPHY(POINT, 4326), -- fuzzed GPS shown on map
  location_precision_m    INTEGER CHECK (location_precision_m >= 0),
  location_hidden         BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE for nests/protected species

  -- Card metadata (JSON blob mirrors CardMetadata)
  card_metadata           JSONB,

  -- Moderation
  moderation_status       moderation_status_t NOT NULL DEFAULT 'pending',
  moderation_allowed      BOOLEAN,
  moderation_reasons      TEXT[] NOT NULL DEFAULT '{}',
  stripped_regions        TEXT[] NOT NULL DEFAULT '{}',
  quality_ok              BOOLEAN,

  -- Provenance
  species_rule_id         UUID REFERENCES species_rules(id) ON DELETE SET NULL,
  is_first_discovery      BOOLEAN NOT NULL DEFAULT FALSE,
  streak_at_capture       INTEGER NOT NULL DEFAULT 0 CHECK (streak_at_capture >= 0),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS sightings_updated_at ON sightings;
CREATE TRIGGER sightings_updated_at
  BEFORE UPDATE ON sightings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS sightings_user_id_idx       ON sightings (user_id);
CREATE INDEX IF NOT EXISTS sightings_created_at_idx    ON sightings (created_at DESC);
CREATE INDEX IF NOT EXISTS sightings_category_idx      ON sightings (detected_category);
CREATE INDEX IF NOT EXISTS sightings_rarity_idx        ON sightings (rarity);
CREATE INDEX IF NOT EXISTS sightings_public_loc_idx    ON sightings USING GIST (public_location)
  WHERE public_location IS NOT NULL AND location_hidden = FALSE;

-- ============================================================
-- collection_cards
-- One card per unique species per user (best sighting).
-- Drives the Pokédex-style collection screen.
-- ============================================================

CREATE TABLE IF NOT EXISTS collection_cards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  species_name          TEXT NOT NULL,
  category              category_t NOT NULL,
  best_rarity           rarity_t NOT NULL,
  total_xp              INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  sighting_count        INTEGER NOT NULL DEFAULT 0 CHECK (sighting_count >= 0),
  best_sighting_id      UUID REFERENCES sightings(id) ON DELETE SET NULL,
  public_card_image_path TEXT,
  card_metadata         JSONB,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, species_name)
);

DROP TRIGGER IF EXISTS collection_cards_updated_at ON collection_cards;
CREATE TRIGGER collection_cards_updated_at
  BEFORE UPDATE ON collection_cards
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS collection_cards_user_idx    ON collection_cards (user_id);
CREATE INDEX IF NOT EXISTS collection_cards_species_idx ON collection_cards (species_name);

-- ============================================================
-- moderation_events
-- Audit log: every moderation decision for a sighting.
-- ============================================================

CREATE TABLE IF NOT EXISTS moderation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sighting_id     UUID NOT NULL REFERENCES sightings(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          moderation_status_t NOT NULL,
  reasons         TEXT[] NOT NULL DEFAULT '{}',
  stripped_regions TEXT[] NOT NULL DEFAULT '{}',
  quality_ok      BOOLEAN,
  provider        TEXT NOT NULL DEFAULT 'mock',  -- which AI moderation provider was used
  raw_response    JSONB,                          -- provider response for debugging
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_events_sighting_idx ON moderation_events (sighting_id);
CREATE INDEX IF NOT EXISTS moderation_events_user_idx     ON moderation_events (user_id);

-- ============================================================
-- leaderboard VIEW
-- Aggregates XP from profiles. Shows public usernames + total XP.
-- Uses profiles.xp (kept up-to-date by application) for perf;
-- also exposes sightings-computed total for cross-check.
-- ============================================================

CREATE OR REPLACE VIEW leaderboard AS
SELECT
  p.id                               AS user_id,
  p.username,
  p.xp                               AS total_xp,
  p.level,
  COUNT(s.id)                        AS sighting_count,
  COUNT(DISTINCT s.detected_species) AS species_discovered,
  p.avatar_url
FROM profiles p
LEFT JOIN sightings s ON s.user_id = p.id
  AND s.moderation_status = 'allowed'
GROUP BY p.id, p.username, p.xp, p.level, p.avatar_url
ORDER BY p.xp DESC;
