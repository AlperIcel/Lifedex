/**
 * Pure moderation decision logic — no I/O, no side effects.
 *
 * Takes detector signals from any upstream vision/moderation provider and
 * returns a ModerationResult. This layer is provider-agnostic: the real
 * provider adapter calls its API and maps results to DetectorSignals before
 * passing them here.
 */

import type { ModerationResult } from '../domain/types';

/* ------------------------------------------------------------------ */
/* Input contract                                                      */
/* ------------------------------------------------------------------ */

/**
 * Raw detector signals normalised from any vision/moderation provider.
 * All booleans default to false if the detector did not fire.
 */
export interface DetectorSignals {
  /** A human body (full or partial) is clearly visible. */
  hasPerson: boolean;
  /** A human face is clearly visible. */
  hasFace: boolean;
  /** A vehicle license plate is readable. */
  hasLicensePlate: boolean;
  /** A house number or street address is readable. */
  hasHouseNumber: boolean;
  /** Photo appears to be taken inside a private residence (bedroom, bathroom, etc.). */
  isPrivateInterior: boolean;
  /**
   * Overall image quality score from 0 (unusable) to 1 (perfect).
   * Below MIN_QUALITY_SCORE the photo is rejected regardless of content.
   */
  qualityScore: number;
}

/* ------------------------------------------------------------------ */
/* Thresholds (centralised so tests can reason about exact values)    */
/* ------------------------------------------------------------------ */

/** Photos with qualityScore strictly below this value are rejected. */
export const MIN_QUALITY_SCORE = 0.4;

/* ------------------------------------------------------------------ */
/* Decision logic                                                      */
/* ------------------------------------------------------------------ */

/**
 * Decide whether a photo may be used as private evidence.
 *
 * Hard blocks (allowed = false):
 *   - Person or face visible (privacy)
 *   - License plate visible (PII)
 *
 * Soft flags (allowed = true, reasons populated, strippedRegions noted):
 *   - House number visible — flag for potential stripping
 *   - Private interior — flag for user awareness
 *
 * Quality gate (qualityOk = false AND allowed = false when quality too low):
 *   - qualityScore < MIN_QUALITY_SCORE
 */
export function decideModeration(raw: DetectorSignals): ModerationResult {
  const reasons: string[] = [];
  const strippedRegions: string[] = [];
  let hardBlock = false;

  /* --- Hard blocks ------------------------------------------------- */

  if (raw.hasFace) {
    hardBlock = true;
    reasons.push('Human face detected — photo blocked to protect privacy.');
  }

  if (raw.hasPerson && !raw.hasFace) {
    // Face check already covers hasPerson+hasFace together; only add person
    // reason independently when a face was not also flagged (e.g. body only).
    hardBlock = true;
    reasons.push('Human body detected — photo blocked to protect privacy.');
  }

  if (raw.hasLicensePlate) {
    hardBlock = true;
    reasons.push('Vehicle license plate detected — photo blocked to protect PII.');
    strippedRegions.push('license_plate');
  }

  /* --- Soft flags -------------------------------------------------- */

  if (raw.hasHouseNumber) {
    reasons.push('House number or street address detected — region flagged for stripping.');
    strippedRegions.push('house_number');
  }

  if (raw.isPrivateInterior) {
    reasons.push('Photo appears to be taken inside a private interior.');
  }

  /* --- Quality gate ------------------------------------------------ */

  const qualityOk = raw.qualityScore >= MIN_QUALITY_SCORE;

  if (!qualityOk) {
    hardBlock = true;
    reasons.push(
      `Image quality too low (score ${raw.qualityScore.toFixed(2)} < ${MIN_QUALITY_SCORE}) — retake recommended.`,
    );
  }

  return {
    allowed: !hardBlock,
    reasons,
    strippedRegions,
    qualityOk,
  };
}
