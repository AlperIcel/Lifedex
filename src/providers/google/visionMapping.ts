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
export interface VisionAnnotateResponse {
  labelAnnotations?: VisionLabel[];
  localizedObjectAnnotations?: Array<{ name: string; score: number }>;
  webDetection?: {
    webEntities?: VisionWebEntity[];
    bestGuessLabels?: Array<{ label: string }>;
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

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Looks like a scientific binomial, e.g. "Vulpes vulpes". */
function looksBinomial(s: string): boolean {
  return /^[A-Z][a-z]+ [a-z]{2,}$/.test(s.trim());
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
  const topObject = res.localizedObjectAnnotations?.[0]?.name;
  const topLabel = res.labelAnnotations?.[0]?.description;
  const commonNameRaw = bestGuess ?? topObject ?? topLabel ?? 'Unknown';
  const commonName = titleCase(commonNameRaw);

  const scientificName = res.webDetection?.webEntities
    ?.map((e) => e.description ?? '')
    .find((d) => looksBinomial(d));

  const topScore =
    res.localizedObjectAnnotations?.[0]?.score ??
    res.labelAnnotations?.[0]?.score ??
    0.5;
  const confidence = Math.max(0, Math.min(1, topScore));

  const captiveStatus: CaptiveStatus = hasKeyword(all, DOMESTIC_KW) ? 'domestic' : 'wild';
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
