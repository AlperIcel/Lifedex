-- ============================================================
-- LifeDex — Seed Data: species_rules
-- 15 representative species across categories/rarities/sensitivities.
-- Mirrors SpeciesRuleSchema fields.
--
-- public_precision_meters:
--   none/low  → 500 m   (urban/common wildlife)
--   sensitive → 1000 m  (breeding, disturb-risk)
--   protected → 5000 m  (endangered, legal protection)
--
-- xp_multiplier (base XP × multiplier):
--   common   domestic/captive → 0.5
--   common   wild             → 1.0
--   uncommon                  → 1.5
--   rare                      → 2.5
--   epic                      → 4.0
--   legendary                 → 8.0
-- ============================================================

INSERT INTO species_rules
  (species_name, category, base_rarity, sensitivity, public_precision_meters, xp_multiplier, notes)
VALUES

-- ── ANIMALS: common ────────────────────────────────────────────────────────

('Golden Retriever',
 'animal', 'common', 'none', 500, 0.5,
 'Domestic dog; captive status domestic. XP capped, no location sensitivity.'),

('Rock Pigeon',
 'animal', 'common', 'none', 500, 1.0,
 'Urban wild bird. Feral/wild variant counts toward streak.'),

('European Rabbit',
 'animal', 'common', 'none', 500, 1.0,
 'Garden/park rabbit. Zoo/domestic sighting capped to 0.5x.'),

-- ── ANIMALS: uncommon ──────────────────────────────────────────────────────

('Red Fox',
 'animal', 'uncommon', 'low', 500, 1.5,
 'Suburban/rural wild. Juveniles in spring — use low sensitivity.'),

('European Hedgehog',
 'animal', 'uncommon', 'low', 500, 1.5,
 'Nocturnal, gardens. Disturbance risk — do not approach.'),

-- ── ANIMALS: rare / sensitive ──────────────────────────────────────────────

('Common Kingfisher',
 'animal', 'rare', 'sensitive', 1000, 2.5,
 'Nesting on riverbanks Apr–Jul. Location fuzzed to 1km, nest approach discouraged.'),

('Little Owl',
 'animal', 'rare', 'sensitive', 1000, 2.5,
 'Nests in tree hollows. Disturbing nesting birds is illegal in many jurisdictions.'),

-- ── ANIMALS: epic / protected ──────────────────────────────────────────────

('White-tailed Eagle',
 'animal', 'epic', 'protected', 5000, 4.0,
 'Strictly protected. GPS hidden + 5km fuzzing. Never approach nest.'),

-- ── PLANTS ────────────────────────────────────────────────────────────────

('Common Dandelion',
 'plant', 'common', 'none', 500, 1.0,
 'Everywhere. Good intro species for onboarding.'),

('Wild Garlic (Ramsons)',
 'plant', 'uncommon', 'low', 500, 1.5,
 'Woodland floors in spring. Protected in some EU regions — check local rules.'),

('Lady''s Slipper Orchid',
 'plant', 'legendary', 'protected', 5000, 8.0,
 'Critically rare. GPS fully hidden. Collecting is a criminal offence.'),

-- ── TREES ─────────────────────────────────────────────────────────────────

('Common Oak',
 'tree', 'uncommon', 'none', 500, 1.5,
 'Ancient oaks (>200 yr) can be reclassified epic by moderator.'),

('Silver Birch',
 'tree', 'common', 'none', 500, 1.0,
 'Widespread pioneer tree. Good for beginners.'),

-- ── MUSHROOMS ─────────────────────────────────────────────────────────────

('Fly Agaric',
 'mushroom', 'uncommon', 'none', 500, 1.5,
 'Iconic red cap. Toxic — safety note injected into card automatically.'),

('Ghost Orchid Fungus (Epipogium aphyllum)',
 'mushroom', 'legendary', 'protected', 5000, 8.0,
 'Extreme rarity. Parasitic, no chlorophyll. Location fully hidden.');

-- ============================================================
-- Verify row count (should be 15)
-- SELECT COUNT(*) FROM species_rules;
-- ============================================================
