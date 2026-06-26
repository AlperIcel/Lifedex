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

export const RecognitionResultSchema = z.object({
  category: CategorySchema,
  commonName: z.string(),
  scientificName: z.string().optional(),
  confidence: z.number().min(0).max(1),
  captiveStatus: CaptiveStatusSchema,
  sensitivity: SensitivityLevelSchema,
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
  captiveStatus: CaptiveStatusSchema,
  sensitivity: SensitivityLevelSchema,
  privatePhotoUri: z.string(),
  publicImageUri: z.string(),
  publicLocation: PublicLocationSchema,
  card: CardMetadataSchema,
  moderation: ModerationResultSchema,
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
