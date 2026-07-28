/**
 * Species + location de-duplication ("discovery hunt" rule).
 *
 * The game rewards MOVEMENT, not spam. A species may be caught again — but only
 * if you've genuinely moved to a new area. Concretely:
 *   - A capture is BLOCKED (a re-catch: no new card, no XP) when a prior sighting
 *     of the SAME species already exists within NEARBY_METERS (~1 km).
 *   - The same species FURTHER than that is a fresh discovery (new card + XP) —
 *     find the fox in another valley and it counts again.
 *   - This makes a zoo trip give you the monkey ONCE, not ten times, and stops
 *     farming the tree in your garden.
 *
 * Distance is measured against the PUBLIC (fuzzed) location — exact GPS is never
 * stored. With ~200 m fuzz against a 1 km radius that is accurate enough. When a
 * distance can't be measured (the new capture has no GPS, or a prior's location
 * is hidden for species protection), we conservatively treat it as "nearby" and
 * block — you can't farm a species by simply withholding your location.
 *
 * Matching is by scientific name when both sides have one, else by common name
 * (case-insensitive). Pure + deterministic — no I/O.
 */
import type { GeoPoint, RecognitionResult, Sighting } from '@/domain/types';

/** Radius (m) within which the same species counts as already discovered. */
export const NEARBY_METERS = 1000;

export interface DedupInput {
  recognition: RecognitionResult;
  /** The user's existing sightings (seed + own captures). */
  existing: Sighting[];
  /** Raw GPS of the new capture, if available. */
  location?: GeoPoint;
  /** Current time (ms). Unused by the location rule; kept for signature stability. */
  now?: number;
}

export interface DedupResult {
  /**
   * True when this capture is a re-catch that should be blocked: the same species
   * already exists within NEARBY_METERS (or the species exists and the distance
   * can't be measured). False means it's a fresh discovery to reward.
   */
  alreadyDiscovered: boolean;
  /** How many prior sightings of this species exist (at any distance). */
  priorCount: number;
  /** Id of the nearby prior to point the UI at, when blocked. */
  existingSightingId?: string;
  /** Distance (m) to the nearest measurable prior of this species, if any. */
  nearestMeters?: number;
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

/**
 * Decide whether a recognition is a fresh discovery or a nearby re-catch.
 * See the module header for the rule.
 */
export function evaluateDedup({ recognition, existing, location }: DedupInput): DedupResult {
  const priors = existing.filter((s) => sameSpecies(s, recognition));
  if (priors.length === 0) {
    return { alreadyDiscovered: false, priorCount: 0 };
  }

  let nearest: { id: string; meters: number } | undefined;
  let unmeasurable = false;
  for (const p of priors) {
    if (location === undefined || p.publicLocation.hidden) {
      // No GPS on this capture, or a protected prior with a hidden location —
      // distance can't be trusted. Treat conservatively as "nearby".
      unmeasurable = true;
      continue;
    }
    const meters = distanceMeters(location, p.publicLocation);
    if (nearest === undefined || meters < nearest.meters) {
      nearest = { id: p.id, meters };
    }
  }

  const withinRadius = nearest !== undefined && nearest.meters <= NEARBY_METERS;
  const alreadyDiscovered = withinRadius || unmeasurable;

  return {
    alreadyDiscovered,
    priorCount: priors.length,
    existingSightingId: alreadyDiscovered ? (nearest?.id ?? priors[0]?.id) : undefined,
    nearestMeters: nearest?.meters,
  };
}
