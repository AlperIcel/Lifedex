/**
 * Taxon observation frequency — how often the world has recorded a species.
 *
 * iNaturalist publishes a GLOBAL `observations_count` per taxon on a PUBLIC
 * endpoint that needs no token: `GET /v1/taxa/{id}` → `results[0].observations_count`.
 * That number is the honest, scalable rarity signal the game economy runs on
 * (see `src/domain/observationRarity.ts` for the curve it feeds).
 *
 * PRIVACY — the request body/URL contains ONLY a numeric taxon id. No photo, no
 * `file://` path, no GPS, no user identifier, no auth token. It says "somebody,
 * somewhere, wants to know how common taxon 12345 is" and nothing else.
 *
 * BEST-EFFORT — this must NEVER block or fail a catch. Every failure path
 * (offline, timeout, HTTP error, malformed body, no `fetch` at all) resolves to
 * `undefined`, and the caller falls back to the generic rarity default. Nothing
 * here throws.
 *
 * CACHING (same shape as `lore.ts`: in-memory + AsyncStorage):
 *   - A hit AND a "taxon has no count" miss are both cached, so a species costs
 *     at most one request.
 *   - Entries carry a timestamp and expire after `TTL_MS`, because observation
 *     counts grow over time — a permanent cache would freeze a species' rarity
 *     at whatever it was the first time it was caught.
 *   - Network/transport failures are NOT cached: they are transient, and a
 *     permanent negative cache would leave a species stuck on the generic
 *     fallback for the rest of the install.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Public iNaturalist taxa endpoint. No API key, no token. */
const TAXA_ENDPOINT = 'https://api.inaturalist.org/v1/taxa';

const CACHE_PREFIX = 'inatObs:v1:';

/** Counts drift upward; re-check roughly monthly. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Give up quickly — a slow lookup must not stall the capture pipeline. */
const TIMEOUT_MS = 6000;

/** Stored when iNat has no usable count for the taxon — avoids refetching. */
const MISS = '__miss__';

/** In-memory cache: taxonId → count, or null for a known miss. */
const mem = new Map<number, number | null>();

interface CacheEntry {
  /** Observation count, or null when iNat reported none. */
  c: number | null;
  /** Epoch ms the entry was written. */
  t: number;
}

/** Shape of the bit of the `/v1/taxa/{id}` response we consume. */
interface TaxaResponse {
  results?: { observations_count?: number }[];
}

/** True for a usable taxon id (a positive integer). */
function isValidTaxonId(taxonId: number): boolean {
  return Number.isInteger(taxonId) && taxonId > 0;
}

/** Normalise a wire value to a usable count, or null. */
function toCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/**
 * GET the taxon and read its global observation count.
 * Resolves to null when iNat answers but has no usable count; THROWS on
 * transport failure so the caller can distinguish "no data" from "no network".
 */
async function fetchOne(taxonId: number): Promise<number | null> {
  // `fetch` is missing in some non-RN contexts (e.g. bare node test runners).
  if (typeof fetch !== 'function') throw new Error('fetch unavailable');

  // AbortController is standard in RN; guard anyway so an older runtime just
  // runs without a timeout rather than throwing.
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer =
    controller !== undefined
      ? setTimeout(() => {
          controller.abort();
        }, TIMEOUT_MS)
      : undefined;

  try {
    // Only the taxon id travels — see the privacy note in the file header.
    const resp = await fetch(`${TAXA_ENDPOINT}/${taxonId}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!resp.ok) throw new Error(`iNaturalist taxa API error ${resp.status}`);
    const data = (await resp.json()) as TaxaResponse;
    const first = data.results?.[0];
    if (first === undefined) return null;
    return toCount(first.observations_count);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Global iNaturalist observation count for a taxon, cached.
 *
 * @returns the count, or `undefined` when it is unavailable for ANY reason
 *          (invalid id, offline, timeout, HTTP error, malformed body, or iNat
 *          simply has no count). Never throws.
 */
export async function fetchObservationsCount(
  taxonId: number,
): Promise<number | undefined> {
  if (!isValidTaxonId(taxonId)) return undefined;

  const cached = mem.get(taxonId);
  if (cached !== undefined) return cached ?? undefined;

  const key = CACHE_PREFIX + String(taxonId);

  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      // Legacy/simple sentinel form kept readable alongside the timestamped one.
      if (raw === MISS) {
        mem.set(taxonId, null);
        return undefined;
      }
      const entry = JSON.parse(raw) as CacheEntry;
      if (typeof entry.t === 'number' && Date.now() - entry.t < TTL_MS) {
        const value = toCount(entry.c);
        mem.set(taxonId, value);
        return value ?? undefined;
      }
      // Stale — fall through and refetch.
    }
  } catch {
    // Unreadable cache — fall through to the network.
  }

  let count: number | null;
  try {
    count = await fetchOne(taxonId);
  } catch {
    // Transport failure: deliberately NOT cached (see the header). The catch
    // proceeds without a rarity signal and the next attempt may succeed.
    return undefined;
  }

  mem.set(taxonId, count);
  try {
    const entry: CacheEntry = { c: count, t: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Best-effort cache write — the in-memory entry still stands.
  }
  return count ?? undefined;
}

/** Test hook: drop the in-memory cache. Does not touch AsyncStorage. */
export function __clearObservationsMemCache(): void {
  mem.clear();
}
