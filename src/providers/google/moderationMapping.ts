/**
 * Pure mapping: Google Vision response -> DetectorSignals -> ModerationResult.
 *
 * Reliable privacy signals come from FACE_DETECTION (faces) and OBJECT_LOCALIZATION
 * (person, license plate). SafeSearch adds an adult/violence/racy block on top.
 * House-number detection is intentionally omitted for now (Vision text detection
 * is too noisy — would cause false blocks); quality uses the top label score as a
 * proxy. Decision logic stays in the shared domain `decideModeration`.
 */
import { decideModeration, type DetectorSignals } from '@/domain/moderation';
import type { ModerationResult } from '@/domain/types';
import type { Likelihood, VisionAnnotateResponse } from './visionMapping';

const FACE_CONFIDENCE = 0.5;
const PERSON_SCORE = 0.5;
const PLATE_KEYWORDS = ['license plate', 'registration plate', 'vehicle registration plate'];
const PRIVATE_INTERIOR_KW = ['bedroom', 'bathroom', 'toilet', 'living room'];

function isBad(v: Likelihood | undefined): boolean {
  return v === 'LIKELY' || v === 'VERY_LIKELY';
}

/** Derive normalized detector signals from a Vision response. */
export function toSignals(res: VisionAnnotateResponse): DetectorSignals {
  const faces = res.faceAnnotations ?? [];
  const hasFace = faces.some((f) => (f.detectionConfidence ?? 0) >= FACE_CONFIDENCE);

  const objects = (res.localizedObjectAnnotations ?? []).map((o) => ({
    name: o.name.toLowerCase(),
    score: o.score,
  }));
  const hasPerson = objects.some((o) => o.name === 'person' && o.score >= PERSON_SCORE);
  const hasLicensePlate = objects.some((o) => PLATE_KEYWORDS.some((k) => o.name.includes(k)));

  const labels = (res.labelAnnotations ?? []).map((l) => l.description.toLowerCase());
  const isPrivateInterior = PRIVATE_INTERIOR_KW.some((k) => labels.includes(k));

  // Proxy: if Vision is confident about the top label, the image is usable.
  const qualityScore = res.labelAnnotations?.[0]?.score ?? 0.6;

  return {
    hasPerson,
    hasFace,
    hasLicensePlate,
    hasHouseNumber: false,
    isPrivateInterior,
    qualityScore,
  };
}

/** Map a Vision response to a moderation decision (domain logic + SafeSearch). */
export function mapModeration(res: VisionAnnotateResponse): ModerationResult {
  const base = decideModeration(toSignals(res));

  const ss = res.safeSearchAnnotation;
  if (ss !== undefined && (isBad(ss.adult) || isBad(ss.violence) || isBad(ss.racy))) {
    return {
      ...base,
      allowed: false,
      reasons: [...base.reasons, 'Inappropriate content detected — photo blocked.'],
    };
  }

  return base;
}
