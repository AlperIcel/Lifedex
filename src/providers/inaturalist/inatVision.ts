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
 *
 * Resilience: iNat is treated as the primary. If the iNat call fails entirely but
 * a floraRefiner exists, we fall back to the refiner's result rather than throwing
 * — a degraded flora ID beats no ID. If the refiner call fails, we keep the iNat
 * base result.
 *
 * The mock-mode `hint` arg is ignored — a real provider derives the species from
 * the image itself.
 */
import type { RecognitionResult } from '@/domain/types';
import { fetchObservationsCount } from '@/lib/inatObservations';
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

    return await withObservationsCount(final, base, scored);
  }
}

/**
 * Attach the taxon's global observation count to the final result.
 *
 * Only ever reuses the iNat taxon id when the final pick is the SAME species as
 * iNat's own guess: when the flora refiner overrides with a different taxon we do
 * not know its iNat id, and stamping the overridden species' count on it would be
 * a silent lie about rarity. In that case the field stays undefined and scoring
 * falls back to the generic default.
 *
 * Best-effort throughout — this never throws and never blocks a catch.
 */
async function withObservationsCount(
  final: RecognitionResult,
  base: RecognitionResult,
  scored: InatScoreResponse,
): Promise<RecognitionResult> {
  // Already known (score_image embedded it) — no extra request.
  if (final.observationsCount !== undefined) return final;
  if (final.category === 'unknown') return final;
  if (!sameSpecies(final, base)) return final;

  const taxonId = topTaxonId(scored);
  if (taxonId === undefined) return final;

  try {
    // Sends ONLY the numeric taxon id — no photo, no location, no user data.
    const count = await fetchObservationsCount(taxonId);
    return count === undefined ? final : { ...final, observationsCount: count };
  } catch {
    // fetchObservationsCount already swallows its own failures; belt and braces.
    return final;
  }
}
