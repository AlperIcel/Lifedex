/**
 * Pure mapping: PlantNet `/v2/identify` response -> LifeDex RecognitionResult.
 *
 * Kept dependency-free (no network, no env, no Supabase) so the classification
 * logic is fully unit-tested against fixture responses — exactly the split used
 * for Google Vision (see ../google/visionMapping.ts). The client
 * (plantnetClient.ts) does only HTTP/multipart plumbing and delegates here.
 *
 * PlantNet is FLORA-ONLY: it identifies vascular plants from photos of organs
 * (leaf, flower, fruit, bark). It never returns animals and never returns fungi,
 * so this mapper can only ever produce 'plant', 'tree' or 'unknown'. Fauna and
 * fungi are the iNaturalist provider's job; the composite provider decides which
 * of the two answers wins.
 */
import type {
  CaptiveStatus,
  Category,
  RecognitionResult,
  SensitivityLevel,
} from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Response shape (only the fields we consume)                        */
/* ------------------------------------------------------------------ */

/** A PlantNet taxon node — genus and family use the same minimal shape. */
export interface PlantNetTaxonName {
  scientificNameWithoutAuthor: string;
}

export interface PlantNetSpecies {
  /** Binomial without the authorship suffix, e.g. "Helianthus annuus". */
  scientificNameWithoutAuthor: string;
  /** Authorship, e.g. "L." — deliberately unused (not part of a display name). */
  scientificNameAuthorship?: string;
  genus?: PlantNetTaxonName;
  family?: PlantNetTaxonName;
  /** Localised common names, most relevant first. May be absent or empty. */
  commonNames?: string[];
}

export interface PlantNetResult {
  /** Match score in 0..1, results are returned best-first. */
  score: number;
  species: PlantNetSpecies;
}

export interface PlantNetResponse {
  results?: PlantNetResult[];
}

/* ------------------------------------------------------------------ */
/* Heuristics + constants                                            */
/* ------------------------------------------------------------------ */

/**
 * Below this top score we refuse to guess and return an 'unknown' result, so the
 * composite provider can prefer another source instead of showing the user a
 * confident-looking wrong species. PlantNet scores drop off very fast, so 0.1 is
 * already a weak-but-plausible match.
 */
export const MIN_CONFIDENCE = 0.1;

/**
 * Families whose members are (overwhelmingly) trees or large woody shrubs.
 *
 * KNOWN LIMITATION — this is a coarse family-level heuristic, not botany:
 *  - PlantNet gives us no growth-habit field, so family is the only signal.
 *  - Every one of these families also contains non-tree members (e.g. Salicaceae
 *    includes creeping dwarf willows, Sapindaceae includes vines), so some plants
 *    will be labelled 'tree' when a botanist would say 'shrub'/'herb'.
 *  - Conversely many tree families are absent (Rosaceae, Malvaceae, Myrtaceae,
 *    Lauraceae, Arecaceae…) because they are mostly non-trees or mixed; those
 *    fall back to 'plant'.
 * The product cost of a miss is only the card's category label, so we keep the
 * list short, high-precision and easy to extend, rather than pretending to a
 * completeness we cannot reach without a taxonomy database.
 *
 * Aceraceae is retained alongside Sapindaceae: modern treatments sank the maples
 * into Sapindaceae, but PlantNet's backbone still emits the older name for some
 * taxa.
 */
export const TREE_FAMILIES: readonly string[] = [
  'Pinaceae', // pines, spruces, firs
  'Fagaceae', // oaks, beeches, chestnuts
  'Betulaceae', // birches, alders, hazels
  'Salicaceae', // willows, poplars
  'Aceraceae', // maples (legacy family name)
  'Sapindaceae', // maples, horse chestnuts (current placement)
  'Cupressaceae', // cypresses, junipers, yews' neighbours
  'Oleaceae', // ashes, olives, lilacs
];

const TREE_FAMILY_SET = new Set(TREE_FAMILIES.map((f) => f.toLowerCase()));

/** Title-cases a common name ("common sunflower" -> "Common Sunflower"). */
function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** The 'unknown' answer used for both "no results" and "below threshold". */
function unknownResult(): RecognitionResult {
  return {
    category: 'unknown',
    commonName: 'Unknown',
    scientificName: undefined,
    confidence: 0,
    captiveStatus: 'wild',
    sensitivity: 'none',
    subjectBox: undefined,
  };
}

/** 'tree' for the known woody families, else 'plant' (PlantNet is flora-only). */
function inferCategory(species: PlantNetSpecies): Category {
  const family = species.family?.scientificNameWithoutAuthor;
  if (family !== undefined && TREE_FAMILY_SET.has(family.trim().toLowerCase())) {
    return 'tree';
  }
  return 'plant';
}

/* ------------------------------------------------------------------ */
/* Mapper                                                            */
/* ------------------------------------------------------------------ */

/**
 * Map a PlantNet identify response to a RecognitionResult.
 * - Uses ONLY the top-scoring result; PlantNet returns results best-first.
 * - category: 'tree' for a known tree family, else 'plant'; never 'mushroom'
 *   and never 'animal' (PlantNet cannot recognise either).
 * - commonName: first common name, title-cased; falls back to the scientific
 *   name VERBATIM (a binomial must keep "Genus species" casing — title-casing it
 *   into "Genus Species" would be nomenclaturally wrong).
 * - scientificName: `scientificNameWithoutAuthor` (authorship is dropped).
 * - confidence: top score clamped to 0..1.
 * - captiveStatus: always 'wild' — a "domestic"/"captive" distinction is
 *   meaningless for flora, and cultivated-vs-wild is not something PlantNet
 *   reports.
 * - sensitivity: always 'none'. Protected-species classification is a separate
 *   layer (the species-rules catalogue), which must not be second-guessed here.
 * - subjectBox: always undefined — PlantNet returns no bounding boxes.
 */
export function mapPlantNetResponse(res: PlantNetResponse): RecognitionResult {
  const top = res.results?.[0];
  if (top === undefined) return unknownResult();

  // Wire data is cast unchecked: a missing/NaN score must fail the gate, not slip
  // through as confidence: NaN (which would poison XP and fail the schema).
  const rawScore = Number(top.score);
  const confidence = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0;
  if (confidence < MIN_CONFIDENCE) return unknownResult();

  // A malformed result with no species object must map to unknown, not throw.
  const species = top.species as PlantNetSpecies | undefined;
  if (species === undefined) return unknownResult();

  const scientificRaw = species.scientificNameWithoutAuthor;
  const scientificName =
    typeof scientificRaw === 'string' && scientificRaw.trim().length > 0
      ? scientificRaw.trim()
      : undefined;

  const commonNames = Array.isArray(species.commonNames) ? species.commonNames : [];
  const firstCommon = commonNames.find(
    (n) => typeof n === 'string' && n.trim().length > 0,
  );

  const commonName =
    firstCommon !== undefined ? titleCase(firstCommon) : (scientificName ?? 'Unknown');

  const category: Category = inferCategory(top.species);
  const captiveStatus: CaptiveStatus = 'wild';
  const sensitivity: SensitivityLevel = 'none';

  return {
    category,
    commonName,
    scientificName,
    confidence,
    captiveStatus,
    sensitivity,
    subjectBox: undefined,
  };
}
