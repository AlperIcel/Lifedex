/**
 * Pure mapping: Google Cloud Vision annotate response -> LifeDex RecognitionResult.
 *
 * Kept dependency-free so the (fiddly, important) classification logic is fully
 * unit-tested with fixture responses — no network needed. The provider
 * (googleVision.ts) only does the HTTP + base64 plumbing and delegates here.
 *
 * Category priority matches the product rule: ANIMAL wins, then flora
 * (mushroom/tree/plant), else unknown. Landmarks/POIs are a separate detector
 * (future) and not handled here.
 */
import type {
  CaptiveStatus,
  Category,
  RecognitionResult,
  SensitivityLevel,
} from '@/domain/types';

/* Minimal shape of the bits of the Vision response we use. */
export interface VisionLabel {
  description: string;
  score: number;
}
export interface VisionWebEntity {
  description?: string;
  score?: number;
}
/** Google SafeSearch likelihood enum. */
export type Likelihood =
  | 'UNKNOWN'
  | 'VERY_UNLIKELY'
  | 'UNLIKELY'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERY_LIKELY';

export interface VisionAnnotateResponse {
  labelAnnotations?: VisionLabel[];
  localizedObjectAnnotations?: Array<{ name: string; score: number }>;
  webDetection?: {
    webEntities?: VisionWebEntity[];
    bestGuessLabels?: Array<{ label: string }>;
  };
  faceAnnotations?: Array<{ detectionConfidence?: number }>;
  safeSearchAnnotation?: {
    adult?: Likelihood;
    violence?: Likelihood;
    racy?: Likelihood;
    spoof?: Likelihood;
    medical?: Likelihood;
  };
}

const ANIMAL_KW = [
  'animal', 'mammal', 'bird', 'insect', 'fish', 'reptile', 'amphibian', 'arachnid',
  'dog', 'cat', 'fox', 'deer', 'horse', 'cow', 'cattle', 'sheep', 'goat', 'pig',
  'wildlife', 'fauna', 'beak', 'fur', 'feather', 'snout', 'paw',
];
const MUSHROOM_KW = ['mushroom', 'fungus', 'fungi', 'toadstool', 'bolete', 'agaric', 'chanterelle'];
const TREE_KW = ['tree', 'oak', 'birch', 'pine', 'conifer', 'maple', 'willow', 'spruce', 'trunk', 'woody plant'];
const PLANT_KW = ['plant', 'flower', 'flowering', 'herb', 'shrub', 'grass', 'fern', 'moss', 'leaf', 'wildflower', 'blossom', 'petal', 'flora', 'vegetation'];

const DOMESTIC_KW = ['pet', 'dog', 'cat', 'domestic', 'livestock', 'cattle', 'sheep', 'goat', 'horse', 'poultry', 'farm'];

function hasKeyword(haystack: string[], keywords: string[]): boolean {
  return haystack.some((h) => keywords.some((k) => h.includes(k)));
}

/** Whole-word match — avoids "pet" matching "petal", "cat" matching "cattle". */
function hasWord(haystack: string[], words: string[]): boolean {
  const joined = ` ${haystack.join(' ')} `;
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(joined));
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Generic / meta terms that are useless as a species name. Google's best-guess
 * label and web entities sometimes return these (e.g. a famous ImageNet sample
 * returns "imagenet image example"). We skip them and fall through to a better
 * candidate. Learned from real API output — do not trust bestGuessLabels blindly.
 */
const GENERIC_NAME = [
  'image', 'imagenet', 'photo', 'photograph', 'picture', 'wallpaper', 'stock',
  'close-up', 'closeup', 'example', 'screenshot', 'illustration', 'clip art',
];

function isGeneric(s: string): boolean {
  const l = s.toLowerCase();
  return GENERIC_NAME.some((g) => l.includes(g));
}

/** First non-generic, non-empty candidate (title-cased); falls back to any. */
function pickName(candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    if (c !== undefined && c.trim().length > 0 && !isGeneric(c)) return titleCase(c);
  }
  for (const c of candidates) {
    if (c !== undefined && c.trim().length > 0) return titleCase(c);
  }
  return 'Unknown';
}

/**
 * Common English leading words that produce a binomial-LOOKING string but are
 * NOT scientific names, e.g. "Common sunflower", "Red fox", "Golden retriever".
 * Used to avoid mislabeling a common name as a scientific one.
 */
const LEADING_COMMON_WORDS = [
  'common', 'golden', 'red', 'great', 'lesser', 'domestic', 'wild', 'european',
  'american', 'northern', 'southern', 'giant', 'little', 'black', 'white', 'grey',
  'gray', 'blue', 'green', 'spotted', 'striped', 'eurasian', 'house',
];

/**
 * Looks like a genuine scientific binomial, e.g. "Vulpes vulpes" — a capitalised
 * Latin genus + lowercase species, where the first word is not a common English
 * qualifier ("Common sunflower" must NOT match).
 */
function looksScientific(s: string): boolean {
  const m = s.trim().match(/^([A-Z][a-z]+) ([a-z]{2,})$/);
  return m !== null && !LEADING_COMMON_WORDS.includes(m[1]!.toLowerCase());
}

function inferCategory(labels: string[]): Category {
  if (hasKeyword(labels, ANIMAL_KW)) return 'animal';
  if (hasKeyword(labels, MUSHROOM_KW)) return 'mushroom';
  if (hasKeyword(labels, TREE_KW)) return 'tree';
  if (hasKeyword(labels, PLANT_KW)) return 'plant';
  return 'unknown';
}

/**
 * Map a Vision response to a RecognitionResult.
 * - commonName: Vision's best-guess label if present, else the top object/label.
 * - scientificName: first web entity that looks like a binomial, if any.
 * - confidence: top label/object score (0..1).
 * - captiveStatus: domestic when pet/livestock keywords appear, else wild.
 * - sensitivity: defaults to 'none' (protected-species lookup is a later layer).
 */
export function mapVisionResponse(res: VisionAnnotateResponse): RecognitionResult {
  const labels = (res.labelAnnotations ?? []).map((l) => l.description.toLowerCase());
  const objects = (res.localizedObjectAnnotations ?? []).map((o) => o.name.toLowerCase());
  const all = [...labels, ...objects];

  const category = inferCategory(all);

  const bestGuess = res.webDetection?.bestGuessLabels?.[0]?.label;
  const webEntityNames = (res.webDetection?.webEntities ?? [])
    .map((e) => e.description)
    .filter((d): d is string => d !== undefined && d.length > 0);
  // Real-data lesson: the first non-generic web entity is the most reliable
  // common name (e.g. "Golden Retriever", "Common Sunflower"), beating both the
  // best-guess (often an image title like "sunflower profile") and generic
  // labels. Exclude scientific binomials here — those become scientificName.
  const topWebEntity = webEntityNames.find((d) => !isGeneric(d));
  const topObject = res.localizedObjectAnnotations?.[0]?.name;
  const topLabel = res.labelAnnotations?.[0]?.description;
  const commonName = pickName([topWebEntity, bestGuess, topObject, topLabel]);

  const scientificName = webEntityNames.find((d) => looksScientific(d));

  const topScore =
    res.localizedObjectAnnotations?.[0]?.score ??
    res.labelAnnotations?.[0]?.score ??
    0.5;
  const confidence = Math.max(0, Math.min(1, topScore));

  // Captive status only applies to animals; flora is always "wild".
  const captiveStatus: CaptiveStatus =
    category === 'animal' && hasWord(all, DOMESTIC_KW) ? 'domestic' : 'wild';
  const sensitivity: SensitivityLevel = 'none';

  return {
    category,
    commonName,
    scientificName: scientificName !== undefined && scientificName.length > 0 ? scientificName : undefined,
    confidence,
    captiveStatus,
    sensitivity,
  };
}
