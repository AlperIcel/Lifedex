/**
 * PlantNetProvider — real FLORA recognition via the PlantNet identify API.
 *
 * Thin seam between the app's provider contract and the two tested halves: the
 * client (HTTP/multipart) and the pure mapper. It holds no state beyond its
 * credentials, so it is safe to construct once at wiring time.
 *
 * Flora-only by design: it will never return 'animal' or 'mushroom'. It is meant
 * to be used behind the composite provider, which asks iNaturalist for fauna and
 * fungi and picks the better of the two answers.
 *
 * The mock-mode `hint` argument is ignored — a real provider derives the species
 * from the image itself.
 */
import type { RecognitionResult } from '@/domain/types';
import type { VisionRecognitionProvider } from '../interfaces';
import { identify, type PlantNetClientOptions } from './plantnetClient';
import { mapPlantNetResponse } from './plantnetMapping';

export class PlantNetProvider implements VisionRecognitionProvider {
  constructor(private readonly opts: PlantNetClientOptions) {}

  /**
   * Errors are NOT swallowed: a network/quota failure must be visible to the
   * caller so the composite provider can fall back to another source rather
   * than silently reporting "unknown".
   */
  async recognize(imageUri: string): Promise<RecognitionResult> {
    const res = await identify(imageUri, this.opts);
    return mapPlantNetResponse(res);
  }
}
