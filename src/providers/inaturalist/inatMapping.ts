/**
 * Pure mapping: iNaturalist Computer Vision `score_image` response ->
 * LifeDex RecognitionResult.
 *
 * Kept dependency-free (no network, no I/O) so the classification/threshold logic
 * is fully unit-tested with fixture responses. The provider (inatVision.ts) does
 * the HTTP plumbing and delegates here; the client (inatClient.ts) produces the
 * `InatScoreResponse` this consumes.
 *
 * Known category boundary: iNat's iconic taxa have no dedicated "tree" bucket —
 * every plant (including trees) carries `iconic_taxon_name: 'Plantae'`. So trees
 * map to category 'plant' here. A later domain layer may reclassify woody plants
 * as 'tree' from the taxon name; this pure mapper does not.
 */
import type {
  CaptiveStatus,
  Category,
  RecognitionResult,
  SensitivityLevel,
} from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Wire types — shape of the iNat score_image response we consume.     */
/* ------------------------------------------------------------------ */

/** A single taxon as returned inside a score result. */
export interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  /** Numeric rank depth (species=10, genus=20, family=30, …). Optional. */
  rank_level?: number;
  preferred_common_name?: string;
  /** Iconic (top-level) taxon, e.g. 'Aves', 'Plantae', 'Fungi'. */
  iconic_taxon_name?: string;
  /**
   * GLOBAL observation count for this taxon. score_image sometimes embeds it in
   * the taxon record; when it does we get the rarity signal for free and skip the
   * follow-up /v1/taxa lookup entirely.
   */
  observations_count?: number;
}

/** One scored candidate. `combined_score` is a 0..100 percentage. */
export interface InatScoreResult {
  combined_score: number;
  vision_score?: number;
  taxon: InatTaxon;
}

/** The `POST /v1/computervision/score_image` response body. */
export interface InatScoreResponse {
  total_results: number;
  results: InatScoreResult[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * Minimum top-candidate confidence (combined_score/100) to accept a catch.
 * Below this, or with no usable result, we return the "nothing to catch" result.
 */
export const MIN_CONFIDENCE = 0.1;

/**
 * The empty / miss result — "nothing to catch here". Returned when there are no
 * results, confidence is below MIN_CONFIDENCE, or the top taxon is coarser than
 * genus (an un-catchable identification like "family Canidae").
 */
export const NO_CATCH: RecognitionResult = {
  category: 'unknown',
  commonName: 'Unknown',
  confidence: 0,
  captiveStatus: 'wild',
  sensitivity: 'none',
};

/**
 * Iconic-taxon names that map to the 'animal' category. iNat may return either
 * the kingdom (`Animalia`) or a specific iconic class (`Aves`, `Insecta`, …).
 */
const ANIMAL_ICONIC = new Set([
  'Animalia',
  'Aves',
  'Mammalia',
  'Reptilia',
  'Amphibia',
  'Actinopterygii',
  'Mollusca',
  'Arachnida',
  'Insecta',
]);

/**
 * Ranks that are genus-or-finer and therefore catchable. Anything not here
 * (family, subfamily, order, class, phylum, kingdom, …) is "too coarse" — the CV
 * model isn't confident enough about the actual organism, so we return NO_CATCH.
 * Kept as a name set (plus a rank_level fallback below) because rank_level is
 * optional in the wire response. Must stay consistent with the rank_level path:
 * every rank here is ≤ genus depth, so the two agree on the same taxon whether or
 * not rank_level is present (includes the between-genus-and-species iNat ranks).
 */
const GENUS_OR_FINER_RANKS = new Set([
  'genus',
  'genushybrid',
  'subgenus',
  'section',
  'subsection',
  'complex',
  'species',
  'subspecies',
  'variety',
  'form',
  'hybrid',
  'infrahybrid',
]);

/** iNat rank_level for genus. Anything numerically ≤ this is genus-or-finer. */
const GENUS_RANK_LEVEL = 20;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Map an iconic-taxon name to a LifeDex category (see file header re: trees). */
function categoryFromIconic(iconic: string | undefined): Category {
  if (iconic === undefined) return 'unknown';
  if (ANIMAL_ICONIC.has(iconic)) return 'animal';
  if (iconic === 'Plantae') return 'plant';
  if (iconic === 'Fungi') return 'mushroom';
  return 'unknown';
}

/** True when the taxon is at genus level or finer (i.e. catchable). */
function isGenusOrFiner(taxon: InatTaxon): boolean {
  if (typeof taxon.rank_level === 'number' && Number.isFinite(taxon.rank_level)) {
    return taxon.rank_level <= GENUS_RANK_LEVEL;
  }
  return GENUS_OR_FINER_RANKS.has((taxon.rank ?? '').toLowerCase());
}

/**
 * combined_score coerced to a finite number; a missing/NaN score sorts to the
 * bottom (-Infinity) so it can never win the max or slip past the threshold.
 * Wire data is cast unchecked, so `combined_score` can be undefined at runtime.
 */
function scoreOf(r: InatScoreResult | undefined): number {
  const n = Number(r?.combined_score);
  return Number.isFinite(n) ? n : -Infinity;
}

/** Pick the highest-scoring candidate (robust to unsorted / NaN responses). */
function topResult(results: InatScoreResult[]): InatScoreResult | undefined {
  if (results.length === 0) return undefined;
  return results.reduce((best, r) => (scoreOf(r) > scoreOf(best) ? r : best));
}

/**
 * The taxon this response resolves to, or undefined when the response is a miss
 * (no results, below MIN_CONFIDENCE, malformed, or coarser than genus).
 *
 * Shared by `mapInatResponse` and `topTaxonId` so both apply EXACTLY the same
 * acceptance gates — the provider must never look up an observation count for a
 * taxon the mapper rejected.
 */
function acceptedTaxon(
  res: InatScoreResponse,
): { taxon: InatTaxon; confidence: number } | undefined {
  const top = topResult(res.results ?? []);
  if (top === undefined) return undefined;

  // Wire data is cast unchecked: a missing/NaN combined_score must fail the gate
  // (not slip through as confidence: NaN, which would poison XP and fail the
  // RecognitionResult schema). scoreOf() already floors it to a finite number.
  const raw = scoreOf(top);
  const confidence = raw < 0 ? 0 : Math.max(0, Math.min(1, raw / 100));
  if (confidence < MIN_CONFIDENCE) return undefined;

  // Guard the nested taxon too — a malformed result must map to NO_CATCH, not
  // throw a TypeError (which the provider would misread as "iNat is down").
  const taxon = top.taxon as InatTaxon | undefined;
  if (taxon === undefined || typeof taxon.name !== 'string' || taxon.name.length === 0) {
    return undefined;
  }
  if (!isGenusOrFiner(taxon)) return undefined;

  return { taxon, confidence };
}

/**
 * The iNaturalist taxon id of the accepted top candidate, or undefined for a
 * miss. The provider uses it to look up the taxon's global observation count
 * (the rarity signal) when the score response didn't already embed one.
 */
export function topTaxonId(res: InatScoreResponse): number | undefined {
  const id = acceptedTaxon(res)?.taxon.id;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined;
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

/**
 * Map an iNat score_image response to a RecognitionResult.
 *
 * - category:      derived from `taxon.iconic_taxon_name` (trees → 'plant').
 * - commonName:    `preferred_common_name` ?? `name` ?? 'Unknown', title-cased.
 * - scientificName:`taxon.name` when rank is species/genus/subspecies, else undefined.
 * - confidence:    clamp(top combined_score / 100, 0..1).
 * - captiveStatus: always 'wild' — CV has no captive signal.
 * - sensitivity:   always 'none' — protected-species lookup is a later domain layer.
 * - subjectBox:    always undefined — score_image returns no bounding box.
 * - observationsCount: `taxon.observations_count` when the response embeds it
 *                  (free rarity signal); otherwise undefined and the provider
 *                  fetches it via `topTaxonId` + the public /v1/taxa endpoint.
 * - iconicTaxon:   `taxon.iconic_taxon_name` verbatim (e.g. 'Insecta') — feeds
 *                  src/domain/lab.ts's `qualifiesForMacroLens`.
 * - taxonId:       `taxon.id` of the accepted candidate — same value
 *                  `topTaxonId(res)` returns (both read the SAME accepted
 *                  candidate), surfaced directly on the result so callers that
 *                  only see the mapped RecognitionResult (e.g. the sighting
 *                  pipeline) can still carry it onto the persisted Sighting.
 *
 * Returns NO_CATCH when there are no results, confidence < MIN_CONFIDENCE, or the
 * top taxon is coarser than genus.
 */
export function mapInatResponse(res: InatScoreResponse): RecognitionResult {
  const accepted = acceptedTaxon(res);
  if (accepted === undefined) return { ...NO_CATCH };
  const { taxon, confidence } = accepted;

  const category = categoryFromIconic(taxon.iconic_taxon_name);

  const rawCommon =
    taxon.preferred_common_name !== undefined &&
    taxon.preferred_common_name.length > 0
      ? taxon.preferred_common_name
      : taxon.name;
  const commonName = titleCase(rawCommon);

  // We are past the genus-or-finer gate, so taxon.name IS the scientific name
  // (uninomial at genus, binomial at species, trinomial for subspecies/variety/
  // form). Accept it verbatim — no rank whitelist, which previously dropped
  // valid names for variety/form/hybrid ranks.
  const scientificName = taxon.name;

  const captiveStatus: CaptiveStatus = 'wild';
  const sensitivity: SensitivityLevel = 'none';

  // Free rarity signal when the response carries it; must be a finite, sane
  // integer (wire data is unchecked) or the RecognitionResult schema would fail.
  const rawCount = taxon.observations_count;
  const observationsCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount >= 0
      ? Math.floor(rawCount)
      : undefined;

  return {
    category,
    commonName,
    scientificName,
    confidence,
    captiveStatus,
    sensitivity,
    observationsCount,
    iconicTaxon: taxon.iconic_taxon_name,
    taxonId: taxon.id,
    // subjectBox intentionally omitted: score_image has no localization.
  };
}
