/**
 * Provider factory for LifeDex.
 *
 * `getProviders()` reads `env.aiProvider` and returns the appropriate
 * implementation of every provider interface. In mock mode (the default) no API
 * keys or network access are required.
 *
 * Real adapters are TODO stubs — add them here and switch on env.aiProvider
 * (e.g. 'openai', 'google', …) when you wire up production credentials.
 *
 * LocationPrivacy and RarityScoring are pure domain logic — they are always
 * wired from the domain implementations regardless of AI_PROVIDER.
 */
import { env } from '../config/env';
import { DefaultLocationPrivacyProvider } from '../domain/locationPrivacy';
import { DefaultRarityScoringProvider } from '../domain/scoring';
import { rarityForRecognition } from '../domain/speciesRules';
import { MockCardGenProvider } from './mock/mockCardGen';
import { MockModerationProvider } from './mock/mockModeration';
import { MockVisionProvider } from './mock/mockVision';
import { GoogleVisionProvider } from './google/googleVision';
import { GoogleModerationProvider } from './google/googleModeration';
import { CropCardGenProvider } from './google/cropCardGen';
import type {
  CardImageGenerationProvider,
  ImageModerationProvider,
  LocationPrivacyProvider,
  RarityScoringProvider,
  VisionRecognitionProvider,
} from './interfaces';

/* ------------------------------------------------------------------ */
/* Provider bundle type                                                 */
/* ------------------------------------------------------------------ */

export interface Providers {
  vision: VisionRecognitionProvider;
  moderation: ImageModerationProvider;
  cardGen: CardImageGenerationProvider;
  locationPrivacy: LocationPrivacyProvider;
  rarityScoring: RarityScoringProvider;
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * Returns the concrete provider implementations for the current environment.
 *
 * Called once at app startup (or in tests) and the result passed via context /
 * dependency injection — do not call repeatedly.
 */
export function getProviders(): Providers {
  // LocationPrivacy and RarityScoring are domain-pure — always use the same impl.
  const locationPrivacy: LocationPrivacyProvider = new DefaultLocationPrivacyProvider();
  // Wire the species-rules resolver so a recognized species gets its real
  // baseRarity (epic/legendary become reachable, not capped at 'rare').
  const rarityScoring: RarityScoringProvider = new DefaultRarityScoringProvider((input) =>
    rarityForRecognition(input.recognition),
  );

  if (env.aiProvider === 'mock') {
    return {
      vision: new MockVisionProvider(),
      moderation: new MockModerationProvider(),
      cardGen: new MockCardGenProvider(),
      locationPrivacy,
      rarityScoring,
    };
  }

  // Real recognition + moderation via Google Cloud Vision (one shared API call
  // per photo). Enabled when a direct key OR a server-side proxy is configured
  // (the proxy path keeps the key off-device). Card generation stays mock.
  if (
    env.aiProvider === 'google' &&
    (env.googleVisionKey !== undefined || env.visionProxyUrl !== undefined)
  ) {
    const visionKey = env.googleVisionKey ?? '';
    return {
      vision: new GoogleVisionProvider(visionKey),
      moderation: new GoogleModerationProvider(visionKey),
      // Free subject-crop card image (no key). Upload to public storage happens
      // in the community layer; premium AI restyle is a later slice.
      cardGen: new CropCardGenProvider(),
      locationPrivacy,
      rarityScoring,
    };
  }

  // ── Real adapters (TODO) ─────────────────────────────────────────────────
  // When you add a real provider (e.g. 'google-vision'), implement its adapter
  // in src/providers/real/<name>.ts and add a branch here.
  //
  // Example:
  //   if (env.aiProvider === 'google-vision') {
  //     return {
  //       vision: new GoogleVisionProvider(env.googleApiKey),
  //       moderation: new GoogleSafeSearchProvider(env.googleApiKey),
  //       cardGen: new OpenAiDallEProvider(env.openAiKey),
  //       locationPrivacy,
  //       rarityScoring,
  //     };
  //   }
  //
  // For now, unknown providers fall back to mock so the app never crashes with
  // a missing-implementation error.

  console.warn(
    `[LifeDex] Unknown AI provider "${env.aiProvider}" — falling back to mock providers.`,
  );
  return {
    vision: new MockVisionProvider(),
    moderation: new MockModerationProvider(),
    cardGen: new MockCardGenProvider(),
    locationPrivacy,
    rarityScoring,
  };
}
