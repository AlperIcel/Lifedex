/**
 * Provider contracts for LifeDex. Every external capability (vision, moderation,
 * card generation, location privacy, scoring) is behind one of these interfaces
 * so the app can run against MOCK implementations with no API keys, and swap in
 * real providers later via env-driven selection.
 */
import type {
  CardMetadata,
  GeoPoint,
  ModerationResult,
  PublicLocation,
  RecognitionResult,
  ScoreInput,
  ScoreResult,
  SensitivityLevel,
} from '../domain/types';

/** Identifies what a photo contains (category, species, confidence, status). */
export interface VisionRecognitionProvider {
  /**
   * @param imageUri  The captured photo URI.
   * @param hint      Optional mock-mode hint (e.g. 'cat', 'frog') used only by
   *                  the mock provider to return a chosen test subject. Real
   *                  providers ignore it.
   */
  recognize(imageUri: string, hint?: string): Promise<RecognitionResult>;
}

/** Decides whether an image is publishable; strips/blocks private regions. */
export interface ImageModerationProvider {
  moderate(imageUri: string): Promise<ModerationResult>;
}

/**
 * Produces the PUBLIC card image — an AI recreation, never the original photo.
 * Receives the card metadata plus the recognition result for context.
 */
export interface CardImageGenerationProvider {
  /**
   * @param imageUri  The private source photo. Used to derive the card art (e.g.
   *   a subject crop). NEVER returned or published — only the processed result is.
   * @returns publicImageUri which may be a local `file://` URI (upload to public
   *   storage is the community layer's job) or a `mock-card://` placeholder.
   */
  generateCard(
    meta: CardMetadata,
    recognition: RecognitionResult,
    imageUri: string,
  ): Promise<{ publicImageUri: string }>;
}

/** Fuzzes a true GeoPoint into a privacy-safe PublicLocation by sensitivity. */
export interface LocationPrivacyProvider {
  getPublicLocation(p: GeoPoint, s: SensitivityLevel): PublicLocation;
}

/** Computes XP + rarity from a scored sighting. */
export interface RarityScoringProvider {
  score(input: ScoreInput): ScoreResult;
}
