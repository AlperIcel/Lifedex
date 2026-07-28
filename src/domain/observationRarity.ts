/**
 * Observation frequency → rarity. The scalable, context-honest half of the
 * LifeDex rarity economy.
 *
 * WHY THIS EXISTS
 * ---------------
 * `speciesRules.ts` is a hand-curated catalogue of ~48 species. It is accurate
 * but tiny: iNaturalist's CV model recognises hundreds of thousands of taxa, so
 * ~99 % of real catches used to miss the catalogue entirely and fall through to
 * the generic category fallback in `scoring.ts` — which caps at 'rare'. Epic and
 * legendary were therefore unreachable outside the curated list, and the reveal
 * moment never surprised anyone.
 *
 * The honest, scalable rarity signal is how often humans actually record a
 * species: iNaturalist publishes a GLOBAL `observations_count` per taxon. A
 * species with 600 k observations really is an everyday sighting; one with 900
 * really is a lucky find. That is a fact about the world, not a designer's guess,
 * and it exists for every taxon the recogniser can return.
 *
 * This module is PURE: the curve only, no network, no I/O. Fetching + caching the
 * count lives in `src/lib/inatObservations.ts`; wiring lives in the providers.
 *
 * TUNING
 * ------
 * The thresholds below are the only knobs. They are deliberately named constants
 * (not inline numbers) so the economy can be retuned in one place after play
 * testing. Counts are GLOBAL, so the curve is region-independent: a species that
 * is locally abundant but globally scarce still reads as rare, which is the
 * intended "you found something the world rarely sees" framing.
 */
import type { Rarity } from './types';

/* ------------------------------------------------------------------ */
/* The curve                                                           */
/* ------------------------------------------------------------------ */

/**
 * Inclusive lower bounds, in global iNaturalist observations, for each tier.
 * A count is assigned the highest tier whose bound it meets; anything below the
 * `epic` bound is legendary.
 *
 *   >= 500 000            → common      (mallard, dandelion — everyday)
 *   100 000 … 499 999     → uncommon    (oak, robin — takes a walk)
 *    20 000 …  99 999     → rare        (chanterelle, yew — a good day)
 *     2 000 …  19 999     → epic        (eagle owl — a lucky sighting)
 *          < 2 000        → legendary   (ghost orchid — the world rarely sees it)
 */
export const OBSERVATION_RARITY_THRESHOLDS = {
  /** >= this many observations → 'common'. */
  common: 500_000,
  /** >= this many observations → 'uncommon'. */
  uncommon: 100_000,
  /** >= this many observations → 'rare'. */
  rare: 20_000,
  /** >= this many observations → 'epic'; below it → 'legendary'. */
  epic: 2_000,
} as const;

/**
 * Map a global observation count to a rarity tier.
 *
 * Total function — safe to call with any number. A non-finite or negative count
 * is not a real signal, so it deliberately returns the FLOOR tier ('common')
 * rather than the ceiling: malformed data must never mint a legendary. Callers
 * that want "no signal → let the caller decide" should use
 * `rarityFromObservationCount`, which returns undefined instead.
 */
export function rarityFromObservations(count: number): Rarity {
  if (!Number.isFinite(count) || count < 0) return 'common';
  if (count >= OBSERVATION_RARITY_THRESHOLDS.common) return 'common';
  if (count >= OBSERVATION_RARITY_THRESHOLDS.uncommon) return 'uncommon';
  if (count >= OBSERVATION_RARITY_THRESHOLDS.rare) return 'rare';
  if (count >= OBSERVATION_RARITY_THRESHOLDS.epic) return 'epic';
  return 'legendary';
}

/* ------------------------------------------------------------------ */
/* Guarded entry point                                                 */
/* ------------------------------------------------------------------ */

/** True when `value` is a usable observation count (finite, >= 0). */
export function isObservationCount(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Rarity from an OPTIONAL observation count.
 *
 * Returns undefined when there is no usable count (offline, taxon unknown,
 * malformed data) so the caller can fall through to its own default instead of
 * acting on a signal that isn't there. This is the function the rarity
 * resolution chain uses.
 */
export function rarityFromObservationCount(
  count: number | undefined,
): Rarity | undefined {
  return isObservationCount(count) ? rarityFromObservations(count) : undefined;
}
