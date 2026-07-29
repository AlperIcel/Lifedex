/**
 * Taxon lookup — global observation frequency AND taxonomic family, from a
 * single iNaturalist request per taxon.
 *
 * iNaturalist publishes, on one PUBLIC endpoint that needs no token
 * (`GET /v1/taxa/{id}` -> `results[0]`), both:
 *   - `observations_count` — GLOBAL count of how often the world has recorded
 *     this taxon. The honest, scalable rarity signal the game economy runs on
 *     (see `src/domain/observationRarity.ts` for the curve it feeds).
 *   - `ancestors` — the taxon's full kingdom-to-genus ancestor chain, each
 *     entry shaped `{ name, rank, ... }`. The taxonomic FAMILY (the ancestor
 *     with `rank === 'family'`) is the only signal that lets the caller tell a
 *     tree apart from a herbaceous plant: iNat's iconic taxa have no dedicated
 *     "tree" bucket, so every plant — woody or not — is `iconic_taxon_name:
 *     'Plantae'` (see `../providers/inaturalist/inatMapping.ts`). See
 *     `../domain/treeFamilies.ts` for the family allowlist this feeds.
 *
 * PRIVACY — the request body/URL contains ONLY a numeric taxon id. No photo, no
 * `file://` path, no GPS, no user identifier, no auth token. It says "somebody,
 * somewhere, wants to know how common taxon 12345 is, and what family it's in"
 * and nothing else.
 *
 * BEST-EFFORT — this must NEVER block or fail a catch. Every failure path
 * (offline, timeout, HTTP error, malformed body, no `fetch` at all) resolves to
 * `{}` (both fields absent), and the caller falls back to its generic defaults
 * (the rarity default; category stays 'plant'). Nothing here throws.
 *
 * CACHING (same shape as `lore.ts`: in-memory + AsyncStorage):
 *   - A hit AND a "taxon has nothing usable" miss are both cached, so a species
 *     costs at most one request.
 *   - Entries carry a timestamp and expire after `TTL_MS`, because observation
 *     counts grow over time — a permanent cache would freeze a species' rarity
 *     at whatever it was the first time it was caught.
 *   - Network/transport failures are NOT cached: they are transient, and a
 *     permanent negative cache would leave a species stuck on the generic
 *     fallback for the rest of the install.
 *   - The cache entry shape grew a `f` (family) field alongside the original
 *     `c` (count). An entry written by an older build won't have `f` at all;
 *     that reads as "family unknown" (NOT as a permanent "no family"), exactly
 *     like any other best-effort miss — it simply stays unresolved until the
 *     entry's TTL expires and a fresh lookup fills it in. No cache-version bump
 *     needed for that, and existing cached counts remain perfectly valid.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Public iNaturalist taxa endpoint. No API key, no token. */
const TAXA_ENDPOINT = 'https://api.inaturalist.org/v1/taxa';

const CACHE_PREFIX = 'inatObs:v1:';

/** Counts drift upward; re-check roughly monthly. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Give up quickly — a slow lookup must not stall the capture pipeline. */
const TIMEOUT_MS = 6000;

/** Stored when iNat has no usable data for the taxon — avoids refetching. */
const MISS = '__miss__';

/** What we know about one taxon: resolved fields, or null where unavailable. */
interface TaxonRecord {
  /** Observation count, or null when iNat reported none. */
  c: number | null;
  /** Family name, or null when no family ancestor was found. */
  f: string | null;
}

/** In-memory cache: taxonId -> resolved record. */
const mem = new Map<number, TaxonRecord>();

interface CacheEntry {
  /** Observation count, or null when iNat reported none. */
  c: number | null;
  /**
   * Family name, or null when no family ancestor was found. Absent entirely on
   * entries written before family-tracking existed — see the header.
   */
  f: string | null;
  /** Epoch ms the entry was written. */
  t: number;
}

/** One ancestor entry inside a taxon's `ancestors` chain. */
interface TaxaAncestor {
  name?: string;
  rank?: string;
}

/** Shape of the bit of the `/v1/taxa/{id}` response we consume. */
interface TaxaResult {
  observations_count?: number;
  /** Full kingdom -> genus ancestor chain; family is the `rank: 'family'` entry. */
  ancestors?: TaxaAncestor[];
}

interface TaxaResponse {
  results?: TaxaResult[];
}

/** Public shape returned by `fetchTaxonInfo` — both fields best-effort/optional. */
export interface TaxonInfo {
  /** GLOBAL iNaturalist observation count for the taxon. */
  observationsCount?: number;
  /** Taxonomic family name (e.g. "Fagaceae"), when iNat's ancestors include one. */
  family?: string;
}

/** True for a usable taxon id (a positive integer). */
function isValidTaxonId(taxonId: number): boolean {
  return Number.isInteger(taxonId) && taxonId > 0;
}

/** Normalise a wire/cached value to a usable count, or null. */
function toCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** Normalise a wire/cached value to a usable family name, or null. */
function toFamily(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Read the family (the `rank: 'family'` entry) out of a taxon's ancestor chain. */
function familyFromAncestors(ancestors: unknown): string | null {
  if (!Array.isArray(ancestors)) return null;
  for (const a of ancestors) {
    if (a !== null && typeof a === 'object' && (a as TaxaAncestor).rank === 'family') {
      const found = toFamily((a as TaxaAncestor).name);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Project an internal record to the public (undefined-for-null) shape. */
function toTaxonInfo(record: TaxonRecord): TaxonInfo {
  return {
    observationsCount: record.c ?? undefined,
    family: record.f ?? undefined,
  };
}

/**
 * GET the taxon and read its global observation count + family.
 * Resolves to a record (fields null where iNat has nothing usable) when iNat
 * answers; THROWS on transport failure so the caller can distinguish "no data"
 * from "no network".
 */
async function fetchOne(taxonId: number): Promise<TaxonRecord> {
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
    if (first === undefined) return { c: null, f: null };
    return { c: toCount(first.observations_count), f: familyFromAncestors(first.ancestors) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Global iNaturalist observation count AND taxonomic family for a taxon, from
 * a single request, cached.
 *
 * @returns `{}` when nothing is available for ANY reason (invalid id, offline,
 *          timeout, HTTP error, malformed body, or iNat simply has no count/
 *          family for this taxon); otherwise whichever of the two fields it
 *          does have. Never throws.
 */
export async function fetchTaxonInfo(taxonId: number): Promise<TaxonInfo> {
  if (!isValidTaxonId(taxonId)) return {};

  const cached = mem.get(taxonId);
  if (cached !== undefined) return toTaxonInfo(cached);

  const key = CACHE_PREFIX + String(taxonId);

  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      // Legacy/simple sentinel form kept readable alongside the timestamped one.
      // It predates both the TTL and family-tracking, so it is a PERMANENT
      // "nothing usable" record — identical to this module's original behaviour
      // before family-tracking existed.
      if (raw === MISS) {
        const record: TaxonRecord = { c: null, f: null };
        mem.set(taxonId, record);
        return toTaxonInfo(record);
      }
      const entry = JSON.parse(raw) as CacheEntry;
      if (typeof entry.t === 'number' && Date.now() - entry.t < TTL_MS) {
        // entry.f is absent on entries written before family-tracking existed;
        // toFamily(undefined) -> null -> surfaced as `family: undefined`, the
        // same as any other best-effort miss (see header).
        const record: TaxonRecord = { c: toCount(entry.c), f: toFamily(entry.f) };
        mem.set(taxonId, record);
        return toTaxonInfo(record);
      }
      // Stale — fall through and refetch.
    }
  } catch {
    // Unreadable cache — fall through to the network.
  }

  let record: TaxonRecord;
  try {
    record = await fetchOne(taxonId);
  } catch {
    // Transport failure: deliberately NOT cached (see the header). The catch
    // proceeds without a rarity/family signal and the next attempt may succeed.
    return {};
  }

  mem.set(taxonId, record);
  try {
    const entry: CacheEntry = { c: record.c, f: record.f, t: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Best-effort cache write — the in-memory entry still stands.
  }
  return toTaxonInfo(record);
}

/** Test hook: drop the in-memory cache. Does not touch AsyncStorage. */
export function __clearObservationsMemCache(): void {
  mem.clear();
}
