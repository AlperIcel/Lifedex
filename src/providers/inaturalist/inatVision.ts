/**
 * INatRecognitionProvider — real species recognition via iNaturalist's Computer
 * Vision `score_image` endpoint, with an optional flora refiner (PlantNet).
 *
 * Pipeline:
 *   1. Score the photo with iNat (inatClient.scoreImage) and map it (inatMapping).
 *   2. If the base guess is flora (plant/tree/mushroom) and a floraRefiner is
 *      wired in, ask the refiner too and keep whichever is more confident
 *      (inatRouting.pickBest).
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
import type { VisionRecognitionProvider } from '../interfaces';
import { scoreImage, type ScoreImageOptions } from './inatClient';
import { mapInatResponse } from './inatMapping';
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

export class INatRecognitionProvider implements VisionRecognitionProvider {
  constructor(
    private readonly opts: ScoreImageOptions,
    private readonly floraRefiner?: VisionRecognitionProvider,
  ) {}

  async recognize(imageUri: string): Promise<RecognitionResult> {
    let base: RecognitionResult;
    try {
      base = mapInatResponse(await scoreImage(imageUri, this.opts));
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
    if (FLORA_CATEGORIES.has(base.category) && this.floraRefiner !== undefined) {
      try {
        const flora = await this.floraRefiner.recognize(imageUri);
        return pickBest(base, flora);
      } catch {
        // Refiner failed — keep the (already valid) iNat base result.
        return base;
      }
    }

    return base;
  }
}
