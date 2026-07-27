/**
 * Pure routing: choose the better recognition between the iNat base result and an
 * optional flora refiner (PlantNet).
 *
 * Rationale: iNat's CV is strong on fauna/fungi but comparatively weak on plants,
 * where a dedicated flora model (PlantNet) is usually better. So when iNat's own
 * guess is a plant/tree/mushroom, we let a more confident flora result win. For
 * animals we always keep the iNat result — PlantNet has nothing to say there.
 *
 * Dependency-free and deterministic so every branch is unit-tested (no network).
 */
import type { Category, RecognitionResult } from '@/domain/types';

/** Categories a flora refiner (PlantNet) is authoritative about. */
const FLORA_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'plant',
  'tree',
  'mushroom',
]);

function isFlora(category: Category): boolean {
  return FLORA_CATEGORIES.has(category);
}

/**
 * Pick the better of the iNat base result and an optional flora refinement.
 *
 * Returns `flora` only when ALL hold:
 *   - `base` is a flora category (plant/tree/mushroom), AND
 *   - `flora` is present, AND
 *   - `flora.category !== 'unknown'` (the refiner actually identified something), AND
 *   - `flora.confidence > base.confidence` (it is more confident).
 * Otherwise returns `base` unchanged.
 */
export function pickBest(
  base: RecognitionResult,
  flora: RecognitionResult | undefined,
): RecognitionResult {
  if (
    isFlora(base.category) &&
    flora !== undefined &&
    flora.category !== 'unknown' &&
    flora.confidence > base.confidence
  ) {
    return flora;
  }
  return base;
}
