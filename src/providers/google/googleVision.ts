/**
 * GoogleVisionProvider — real species recognition via Google Cloud Vision.
 *
 * Delegates the API call to the shared visionClient (one annotate call per photo,
 * shared with moderation) and maps the response to a RecognitionResult
 * (see visionMapping.ts). Only wired in when AI_PROVIDER=google AND a key is
 * present (see getProviders). The mock-mode `hint` arg is ignored — a real
 * provider derives the species from the image itself.
 *
 * Cost note: Vision's free tier covers ~1000 units/month; beyond that it bills.
 */
import type { RecognitionResult } from '@/domain/types';
import type { VisionRecognitionProvider } from '../interfaces';
import { annotate } from './visionClient';
import { mapVisionResponse } from './visionMapping';

export class GoogleVisionProvider implements VisionRecognitionProvider {
  constructor(private readonly apiKey: string) {}

  async recognize(imageUri: string): Promise<RecognitionResult> {
    const res = await annotate(imageUri, this.apiKey);
    return mapVisionResponse(res);
  }
}
