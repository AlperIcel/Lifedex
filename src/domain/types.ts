/**
 * LifeDex domain contract — THE single source of truth.
 *
 * Every other module imports its types from here. Each concept is defined once
 * as a Zod schema; the matching TypeScript type is inferred from that schema so
 * runtime validation and compile-time types can never drift apart.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Enums                                                              */
/* ------------------------------------------------------------------ */

export const RaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]);
export type Rarity = z.infer<typeof RaritySchema>;

export const CategorySchema = z.enum([
  'animal',
  'plant',
  'tree',
  'mushroom',
  'unknown',
]);
export type Category = z.infer<typeof CategorySchema>;

export const CaptiveStatusSchema = z.enum([
  'wild',
  'domestic',
  'zoo_captive',
  'unknown',
]);
export type CaptiveStatus = z.infer<typeof CaptiveStatusSchema>;

export const SensitivityLevelSchema = z.enum([
  'none',
  'low',
  'sensitive',
  'protected',
]);
export type SensitivityLevel = z.infer<typeof SensitivityLevelSchema>;

/* ------------------------------------------------------------------ */
/* Geo                                                               */
/* ------------------------------------------------------------------ */

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

/**
 * Public, privacy-safe location. `precisionMeters` is the radius the true point
 * has been fuzzed to. When `hidden` is true the coordinates MUST NOT be shown on
 * any public surface (sensitive/protected species, nests, young animals).
 */
export const PublicLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precisionMeters: z.number().nonnegative(),
  hidden: z.boolean(),
});
export type PublicLocation = z.infer<typeof PublicLocationSchema>;

/* ------------------------------------------------------------------ */
/* Recognition / Moderation                                          */
/* ------------------------------------------------------------------ */

/**
 * Normalized (0..1) rectangle of the detected subject within the photo, used to
 * crop the card image to the subject. x/y = top-left, w/h = size.
 */
export const NormalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type NormalizedRect = z.infer<typeof NormalizedRectSchema>;

export const RecognitionResultSchema = z.object({
  category: CategorySchema,
  commonName: z.string(),
  scientificName: z.string().optional(),
  confidence: z.number().min(0).max(1),
  captiveStatus: CaptiveStatusSchema,
  sensitivity: SensitivityLevelSchema,
  /** Bounding box of the subject (from object detection), if available. */
  subjectBox: NormalizedRectSchema.optional(),
  /**
   * GLOBAL number of iNaturalist observations for this taxon — how often humans
   * have recorded this species worldwide. Drives rarity for every species that
   * is NOT in the curated `speciesRules` catalogue (see `observationRarity.ts`).
   *
   * Best-effort and optional: absent when offline, when the provider has no
   * taxon id, or when the lookup failed. A missing count never blocks a catch —
   * scoring falls back to the generic category default.
   */
  observationsCount: z.number().int().nonnegative().optional(),
  /**
   * iNaturalist's top-level "iconic taxon" for the recognised taxon (e.g.
   * 'Insecta', 'Arachnida', 'Mollusca', 'Aves', 'Plantae', 'Fungi'), when the
   * provider supplies one. Feeds src/domain/lab.ts's `qualifiesForMacroLens` —
   * the real macro-subject signal once `subjectBox` is absent, which it always
   * is for the real iNat/PlantNet providers (score_image has no localization).
   * Optional so older persisted/mocked recognitions without it still validate.
   */
  iconicTaxon: z.string().optional(),
  /**
   * The iNaturalist taxon id of the accepted candidate (see
   * src/providers/inaturalist/inatMapping.ts's `topTaxonId`/`acceptedTaxon`).
   * Carried through onto `Sighting.taxonId` at capture time. Optional/best-effort
   * — a missing id never blocks a catch.
   */
  taxonId: z.number().int().positive().optional(),
});
export type RecognitionResult = z.infer<typeof RecognitionResultSchema>;

export const ModerationResultSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()),
  strippedRegions: z.array(z.string()),
  qualityOk: z.boolean(),
});
export type ModerationResult = z.infer<typeof ModerationResultSchema>;

/* ------------------------------------------------------------------ */
/* Scoring                                                           */
/* ------------------------------------------------------------------ */

export const ScoreInputSchema = z.object({
  recognition: RecognitionResultSchema,
  confidence: z.number().min(0).max(1),
  isDuplicate: z.boolean(),
  captiveStatus: CaptiveStatusSchema,
  sensitivity: SensitivityLevelSchema,
  qualityOk: z.boolean(),
  isFirstDiscovery: z.boolean(),
  streak: z.number().int().nonnegative(),
  /**
   * True when the Solo Lab's Makro-Linse gadget applies (owned AND
   * `qualifiesForMacroLens(recognition)` — gated by the caller, not here).
   * Drives a +15% XP step in scoring.ts. Optional so existing callers/tests
   * that don't set it are unaffected (undefined behaves as false).
   */
  macroLens: z.boolean().optional(),
});
export type ScoreInput = z.infer<typeof ScoreInputSchema>;

export const ScoreResultSchema = z.object({
  xp: z.number().int().nonnegative(),
  rarity: RaritySchema,
  reason: z.string(),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;

/* ------------------------------------------------------------------ */
/* Card                                                              */
/* ------------------------------------------------------------------ */

export const CardMetadataSchema = z.object({
  name: z.string(),
  category: CategorySchema,
  rarity: RaritySchema,
  xp: z.number().int().nonnegative(),
  description: z.string(),
  stats: z.record(z.union([z.number(), z.string()])),
  safetyNotes: z.array(z.string()).optional(),
});
export type CardMetadata = z.infer<typeof CardMetadataSchema>;

/* ------------------------------------------------------------------ */
/* Persistence rows                                                  */
/* ------------------------------------------------------------------ */

/**
 * A full sighting row. `privatePhotoUri` is PRIVATE evidence and is never
 * exposed publicly. `publicImageUri` is the AI recreation shown on the card.
 */
export const SightingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string(), // ISO 8601
  category: CategorySchema,
  commonName: z.string(),
  scientificName: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rarity: RaritySchema,
  xp: z.number().int().nonnegative(),
  /**
   * True only for the FIRST time this species was ever caught — drives the +50%
   * bonus and the "new species" moment. Optional so older/seeded rows validate.
   */
  isFirstDiscovery: z.boolean().optional(),
  captiveStatus: CaptiveStatusSchema,
  sensitivity: SensitivityLevelSchema,
  privatePhotoUri: z.string(),
  publicImageUri: z.string(),
  publicLocation: PublicLocationSchema,
  card: CardMetadataSchema,
  moderation: ModerationResultSchema,
  /**
   * GLOBAL iNaturalist observation count for this taxon, carried over from
   * `RecognitionResult.observationsCount` at capture time. Powers the Solo
   * Lab's rarity-intel line (ResultScreen/LabScreen). Optional/best-effort so
   * older persisted rows without it still validate.
   */
  observationsCount: z.number().int().nonnegative().optional(),
  /**
   * iNaturalist taxon id, carried over from `RecognitionResult.taxonId`.
   * Optional/best-effort so older persisted rows without it still validate.
   */
  taxonId: z.number().int().positive().optional(),
});
export type Sighting = z.infer<typeof SightingSchema>;

export const SpeciesRuleSchema = z.object({
  speciesName: z.string(),
  category: CategorySchema,
  baseRarity: RaritySchema,
  sensitivity: SensitivityLevelSchema,
  publicPrecisionMeters: z.number().nonnegative(),
  xpMultiplier: z.number().positive(),
});
export type SpeciesRule = z.infer<typeof SpeciesRuleSchema>;

export const ProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
});
export type Profile = z.infer<typeof ProfileSchema>;
