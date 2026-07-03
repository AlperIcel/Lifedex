/**
 * GoogleModerationProvider — real image moderation via Google Cloud Vision.
 *
 * Shares the single annotate call (visionClient) with recognition, then maps the
 * face / object / safe-search results to a moderation decision (moderationMapping,
 * which delegates to the shared domain `decideModeration`). Wired in only when
 * AI_PROVIDER=google AND a key is present.
 */
import type { ModerationResult } from '@/domain/types';
import type { ImageModerationProvider } from '../interfaces';
import { annotate } from './visionClient';
import { mapModeration } from './moderationMapping';

export class GoogleModerationProvider implements ImageModerationProvider {
  constructor(private readonly apiKey: string) {}

  async moderate(imageUri: string): Promise<ModerationResult> {
    const res = await annotate(imageUri, this.apiKey);
    return mapModeration(res);
  }
}
