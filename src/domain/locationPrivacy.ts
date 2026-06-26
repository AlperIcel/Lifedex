/**
 * Location privacy module for LifeDex.
 *
 * Fuzzes a true GeoPoint into a privacy-safe PublicLocation based on the
 * species sensitivity level. The higher the sensitivity, the coarser the
 * public coordinate — or the location is fully hidden for protected species.
 *
 * Grid-snapping approach: lat/lng are rounded to the nearest grid cell whose
 * width corresponds to precisionMeters. This is stable and idempotent —
 * running the same point through again produces the same output.
 *
 * Approximation used: 1 degree latitude ≈ 111,320 m everywhere.
 * 1 degree longitude ≈ 111,320 * cos(lat) m — we use the cos at the true
 * point so the grid cells are roughly square on the ground.
 */
import type { GeoPoint, PublicLocation, SensitivityLevel } from '../domain/types';
import type { LocationPrivacyProvider } from '../providers/interfaces';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

/** Metres per degree of latitude (constant everywhere on Earth). */
const METERS_PER_DEG_LAT = 111_320;

/**
 * Precision radii per sensitivity tier.
 * 'none'      -> ~175 m  (midpoint of 100–250 m range, picked as a stable default)
 * 'low'       -> ~500 m
 * 'sensitive' -> ~2 000 m
 * 'protected' -> hidden; we still store a coarse ~10 km region for internal use
 */
const PRECISION_METERS: Record<SensitivityLevel, number> = {
  none: 175,
  low: 500,
  sensitive: 2_000,
  protected: 10_000,
};

/* ------------------------------------------------------------------ */
/* Core function                                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns a privacy-safe public location for the given GeoPoint and sensitivity.
 *
 * - Snaps lat/lng to the nearest grid node whose cell size matches
 *   `precisionMeters` on the ground, making the result stable and idempotent.
 * - For 'protected' sensitivity, `hidden` is set to `true` — callers MUST NOT
 *   display the coordinates on any public surface.
 */
export function getPublicLocation(
  p: GeoPoint,
  s: SensitivityLevel,
): PublicLocation {
  const precisionMeters = PRECISION_METERS[s];

  // Convert precision to degree increments.
  const latStep = precisionMeters / METERS_PER_DEG_LAT;

  // Snap latitude first.
  const snappedLat = Math.round(p.lat / latStep) * latStep;

  // Longitude degrees per metre depends on latitude. Derive cos() from the
  // SNAPPED latitude (not the raw input) so the function is idempotent: a
  // second pass sees an already-snapped lat, computes the same lngStep, and
  // lands on the same node. Using p.lat here would drift lng on re-application.
  const cosLat = Math.cos((snappedLat * Math.PI) / 180);
  // Guard against poles (cos ≈ 0) — clamp to a small non-zero value.
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.max(cosLat, 0.0001);
  const lngStep = precisionMeters / metersPerDegLng;

  // Snap longitude to the nearest multiple of the step size.
  const snappedLng = Math.round(p.lng / lngStep) * lngStep;

  // Clamp to valid ranges in case rounding pushed past the boundary.
  const clampedLat = Math.max(-90, Math.min(90, snappedLat));
  const clampedLng = Math.max(-180, Math.min(180, snappedLng));

  return {
    lat: clampedLat,
    lng: clampedLng,
    precisionMeters,
    hidden: s === 'protected',
  };
}

/* ------------------------------------------------------------------ */
/* Provider implementation                                            */
/* ------------------------------------------------------------------ */

/**
 * Concrete LocationPrivacyProvider that wraps `getPublicLocation`.
 * Drop into the provider registry for any sensitivity tier.
 */
export class DefaultLocationPrivacyProvider implements LocationPrivacyProvider {
  getPublicLocation(p: GeoPoint, s: SensitivityLevel): PublicLocation {
    return getPublicLocation(p, s);
  }
}
