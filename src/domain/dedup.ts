/**
 * Species-level de-duplication.
 *
 * A "dex" registers each species once. You should not be able to farm XP by
 * photographing the same tree (or the same species) ten times. This pure module
 * decides, from your existing collection, whether a new recognition is:
 *   - a NEW discovery (first time for this species), or
 *   - ALREADY discovered (a re-catch — no new card/XP).
 *
 * It also flags `sameSpotToday` (same species + nearby + within ~a day) so the UI
 * can say "you already logged this here today" vs the gentler "already in your
 * collection". True individual-animal recognition is out of scope (not reliable
 * across species); this is deliberately species-level + a light spam heuristic.
 *
 * Matching is by scientific name when both sides have one, else by common name
 * (case-insensitive). Pure + deterministic — no I/O.
 */
import type { GeoPoint, RecognitionResult, Sighting } from '@/domain/types';

/** Distance (m) under which a re-catch counts as "the same spot". */
export const SAME_SPOT_METERS = 500;
const DAY_MS = 86_400_000;

export interface DedupInput {
  recognition: RecognitionResult;
  /** The user's existing sightings (seed + own captures). */
  existing: Sighting[];
  /** Raw GPS of the new capture, if available. */
  location?: GeoPoint;
  /** Current time (ms). */
  now: number;
}

export interface DedupResult {
  /** True when this species is already in the collection (a re-catch). */
  alreadyDiscovered: boolean;
  /** How many prior sightings of this species exist. */
  priorCount: number;
  /** True when a prior of this species is within ~SAME_SPOT_METERS and ~a day. */
  sameSpotToday: boolean;
  /** Id of the existing sighting to point the UI at (first match), if any. */
  existingSightingId?: string;
}

function speciesKey(commonName: string, scientificName?: string): string {
  return (scientificName ?? commonName).trim().toLowerCase();
}

function sameSpecies(s: Sighting, r: RecognitionResult): boolean {
  if (
    r.scientificName !== undefined &&
    r.scientificName.length > 0 &&
    s.scientificName !== undefined &&
    s.scientificName.length > 0
  ) {
    return s.scientificName.trim().toLowerCase() === r.scientificName.trim().toLowerCase();
  }
  return s.commonName.trim().toLowerCase() === r.commonName.trim().toLowerCase();
}

/** Haversine great-circle distance in metres. */
function distanceMeters(a: GeoPoint, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Decide whether a recognition is a new discovery or a re-catch. */
export function evaluateDedup({ recognition, existing, location, now }: DedupInput): DedupResult {
  const priors = existing.filter((s) => sameSpecies(s, recognition));
  const alreadyDiscovered = priors.length > 0;

  let sameSpotToday = false;
  if (alreadyDiscovered) {
    sameSpotToday = priors.some((p) => {
      const withinDay = Math.abs(now - new Date(p.createdAt).getTime()) < DAY_MS;
      if (!withinDay) return false;
      if (location === undefined) return true; // can't measure distance → treat as same spot
      return distanceMeters(location, p.publicLocation) <= SAME_SPOT_METERS;
    });
  }

  return {
    alreadyDiscovered,
    priorCount: priors.length,
    sameSpotToday,
    existingSightingId: priors[0]?.id,
  };
}

export { speciesKey };
