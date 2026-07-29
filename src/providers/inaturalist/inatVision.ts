/**
 * INatRecognitionProvider — real species recognition via iNaturalist's Computer
 * Vision `score_image` endpoint, with an optional flora refiner (PlantNet).
 *
 * Pipeline:
 *   1. Score the photo with iNat (inatClient.scoreImage) and map it (inatMapping).
 *   2. If the base guess is flora (plant/tree/mushroom) and a floraRefiner is
 *      wired in, ask the refiner too and keep whichever is more confident
 *      (inatRouting.pickBest).
 *   3. Attach the taxon's GLOBAL observation count — the rarity signal that lets
 *      the economy scale past the ~48 curated species (see observationRarity.ts).
 *      Best-effort: a failure just leaves the field undefined.
 *   4. Reclassify a 'plant' result to 'tree' when that SAME lookup resolves the
 *      taxon's family to a known tree family (domain/treeFamilies.ts). iNat's
 *      iconic taxa have no dedicated "tree" bucket (see inatMapping.ts), so this
 *      is the only place a tree is told apart from a herbaceous plant.
 *      Best-effort: no family resolved -> the result simply stays 'plant'.
 *
 * Resilience: iNat is treated as the primary. If the iNat call fails entirely but
 * a floraRefiner exists, we fall back to the refiner's result rather than throwing
 * — a degraded flora ID beats no ID. If the refiner call fails, we keep the iNat
 * base result.
 *
 * The mock-mode `hint` arg is ignored — a real provider derives the species from
 * the image itself.
 */
import { isTreeFamily } from '@/domain/treeFamilies';
import type { RecognitionResult } from '@/domain/types';
import { fetchTaxonInfo } from '@/lib/inatObservations';
import type { VisionRecognitionProvider } from '../interfaces';
import { scoreImage, type ScoreImageOptions } from './inatClient';
import { mapInatResponse, topTaxonId, type InatScoreResponse } from './inatMapping';
import { pickBest } from './inatRouting';

const FLORA_CATEGORIES = new Set<RecognitionResult['category']>([
  'plant',
  'tree',
  'mushroom',
]);

/**
 * When iNat fails entirely we may fall back to the flora refiner — but PlantNet
 * can't say "this isn't a plant", it just guesses the nearest plant. So an animal
 * photo would come back as a bogus plant. Only accept that blind fallback when the
 * refiner is genuinely confident; otherwise re-throw the original iNat error.
 */
const FALLBACK_MIN_CONFIDENCE = 0.5;

/** Case-insensitive species identity, preferring the scientific name. */
function sameSpecies(a: RecognitionResult, b: RecognitionResult): boolean {
  const norm = (s: string): string => s.trim().toLowerCase();
  if (
    a.scientificName !== undefined &&
    a.scientificName.length > 0 &&
    b.scientificName !== undefined &&
    b.scientificName.length > 0
  ) {
    return norm(a.scientificName) === norm(b.scientificName);
  }
  return norm(a.commonName) === norm(b.commonName);
}

export class INatRecognitionProvider implements VisionRecognitionProvider {
  constructor(
    private readonly opts: ScoreImageOptions,
    private readonly floraRefiner?: VisionRecognitionProvider,
  ) {}

  async recognize(imageUri: string): Promise<RecognitionResult> {
    let scored: InatScoreResponse;
    let base: RecognitionResult;
    try {
      scored = await scoreImage(imageUri, this.opts);
      base = mapInatResponse(scored);
    } catch (err) {
      // iNat unavailable: a flora refiner can only help if it's confident this is
      // actually a plant (it can't reject non-plants). Otherwise surface the real
      // iNat error rather than inventing a low-confidence plant from an animal photo.
      if (this.floraRefiner !== undefined) {
        try {
          const flora = await this.floraRefiner.recognize(imageUri);
          if (flora.category !== 'unknown' && flora.confidence >= FALLBACK_MIN_CONFIDENCE) {
            return flora;
          }
        } catch {
          // refiner also failed — fall through to the original iNat error
        }
      }
      throw err;
    }

    // Only consult the flora refiner when iNat itself thinks this is flora.
    let final = base;
    if (FLORA_CATEGORIES.has(base.category) && this.floraRefiner !== undefined) {
      try {
        final = pickBest(base, await this.floraRefiner.recognize(imageUri));
      } catch {
        // Refiner failed — keep the (already valid) iNat base result.
        final = base;
      }
    }

    return await withTaxonInfo(final, base, scored);
  }
}

/**
 * Attach the taxon's global observation count, and — for a 'plant' result whose
 * family is a known tree family — reclassify it to 'tree'.
 *
 * Both signals come from the SAME best-effort /v1/taxa lookup (fetchTaxonInfo),
 * gated by the identical guard: only ever reuses the iNat taxon id when the
 * final pick is the SAME species as iNat's own guess. When the flora refiner
 * overrides with a different taxon we do not know its iNat id, so neither
 * stamping its count nor reclassifying its category would be honest — both
 * stay untouched in that case (count undefined, category whatever the refiner
 * returned).
 *
 * Tree reclassification only ever applies to category 'plant' — animals, fungi,
 * 'unknown' and already-'tree' results (e.g. from the flora refiner) are never
 * touched. Best-effort: when the lookup yields no family — offline, timeout, the
 * taxon has no family ancestor, or the count arrived pre-embedded in score_image
 * so this lookup was skipped entirely (see the early return below) — the result
 * simply stays 'plant'.
 *
 * Best-effort throughout — this never throws and never blocks a catch.
 */
async function withTaxonInfo(
  final: RecognitionResult,
  base: RecognitionResult,
  scored: InatScoreResponse,
): Promise<RecognitionResult> {
  // Already known (score_image embedded it) — no extra request. NOTE: this also
  // skips the family lookup below, so a plant whose count arrived pre-embedded
  // keeps category 'plant' even if it is botanically a tree — an accepted
  // best-effort gap (see the doc comment above), not a bug.
  if (final.observationsCount !== undefined) return final;
  if (final.category === 'unknown') return final;
  if (!sameSpecies(final, base)) return final;

  const taxonId = topTaxonId(scored);
  if (taxonId === undefined) return final;

  try {
    // Sends ONLY the numeric taxon id — no photo, no location, no user data.
    const { observationsCount, family } = await fetchTaxonInfo(taxonId);

    const withCount =
      observationsCount === undefined ? final : { ...final, observationsCount };

    if (withCount.category === 'plant' && isTreeFamily(family)) {
      return { ...withCount, category: 'tree' };
    }
    return withCount;
  } catch {
    // fetchTaxonInfo already swallows its own failures; belt and braces.
    return final;
  }
}
