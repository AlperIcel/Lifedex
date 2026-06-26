/**
 * Mock ImageModerationProvider — no API keys required.
 *
 * Maps URI keyword markers to DetectorSignals, then delegates to the domain
 * `decideModeration` function (src/domain/moderation.ts) so the same decision
 * logic is shared between the mock and any future real adapter.
 *
 * Marker rules (case-insensitive substrings in imageUri):
 *  'face'            → hasFace = true              → hard block
 *  'person'          → hasPerson = true             → hard block
 *  'plate'           → hasLicensePlate = true       → hard block + strip
 *  'housenumber'
 *  or 'house_number' → hasHouseNumber = true        → soft flag, strip
 *  'interior'
 *  or 'indoor'       → isPrivateInterior = true     → soft flag
 *  'blur' or 'dark'  → qualityScore = 0.1           → quality gate fail
 *  (default)         → qualityScore = 0.9, no flags → allowed
 */
import { decideModeration } from '../../domain/moderation';
import type { ModerationResult } from '../../domain/types';
import type { ImageModerationProvider } from '../interfaces';

/** Exported for unit tests that want to inspect signal mapping independently. */
export function uriToSignals(imageUri: string): Parameters<typeof decideModeration>[0] {
  const lower = imageUri.toLowerCase();
  const isLowQuality = lower.includes('blur') || lower.includes('dark');
  return {
    hasFace: lower.includes('face'),
    hasPerson: lower.includes('person'),
    hasLicensePlate: lower.includes('plate'),
    hasHouseNumber: lower.includes('housenumber') || lower.includes('house_number'),
    isPrivateInterior: lower.includes('interior') || lower.includes('indoor'),
    qualityScore: isLowQuality ? 0.1 : 0.9,
  };
}

export class MockModerationProvider implements ImageModerationProvider {
  async moderate(imageUri: string): Promise<ModerationResult> {
    return decideModeration(uriToSignals(imageUri));
  }
}
