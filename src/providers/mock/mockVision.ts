/**
 * Mock VisionRecognitionProvider — no API keys required.
 *
 * Deterministically picks a species entry from the built-in table by hashing
 * the imageUri string so repeated calls with the same URI always return the
 * same result (useful for tests and UI demos). The hash is a simple djb2
 * variant — no crypto dependency needed.
 *
 * `observationsCount` mirrors each species' real GLOBAL iNaturalist observation
 * count (approximate, rounded — these are hand-entered stand-ins for the live
 * lookup, not fetched data). They exist so mock mode exercises the same rarity
 * path as production:
 *   - The first block of species is ALSO in the curated `speciesRules` catalogue,
 *     which is authoritative, so their counts are carried but not decisive.
 *   - The final block is deliberately NOT curated, so their rarity comes purely
 *     from the observation curve — that is how a mock run shows off rare / epic /
 *     legendary reveals instead of everything capping at 'rare'.
 */
import type { RecognitionResult } from '../../domain/types';
import type { VisionRecognitionProvider } from '../interfaces';

type SpeciesEntry = RecognitionResult;

/** Small cross-category species table used in mock mode. */
const SPECIES_TABLE: SpeciesEntry[] = [
  // ── animals ────────────────────────────────────────────────────────────
  {
    category: 'animal',
    commonName: 'European Robin',
    scientificName: 'Erithacus rubecula',
    confidence: 0.93,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 230_000,
  },
  {
    category: 'animal',
    commonName: 'Red Fox',
    scientificName: 'Vulpes vulpes',
    confidence: 0.88,
    captiveStatus: 'wild',
    sensitivity: 'low',
    observationsCount: 180_000,
  },
  {
    category: 'animal',
    commonName: 'Great Spotted Woodpecker',
    scientificName: 'Dendrocopos major',
    confidence: 0.81,
    captiveStatus: 'wild',
    sensitivity: 'low',
    observationsCount: 70_000,
  },
  {
    category: 'animal',
    commonName: 'Common Frog',
    scientificName: 'Rana temporaria',
    confidence: 0.76,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 55_000,
  },
  {
    category: 'animal',
    commonName: 'Eagle Owl',
    scientificName: 'Bubo bubo',
    confidence: 0.91,
    captiveStatus: 'wild',
    sensitivity: 'protected',
    observationsCount: 5_400,
  },
  {
    category: 'animal',
    commonName: 'Domestic Cat',
    scientificName: 'Felis catus',
    confidence: 0.97,
    captiveStatus: 'domestic',
    sensitivity: 'none',
    observationsCount: 120_000,
  },
  {
    category: 'animal',
    commonName: 'Domestic Dog',
    scientificName: 'Canis familiaris',
    confidence: 0.96,
    captiveStatus: 'domestic',
    sensitivity: 'none',
    observationsCount: 95_000,
  },
  {
    category: 'animal',
    commonName: 'Peacock Butterfly',
    scientificName: 'Aglais io',
    confidence: 0.85,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 90_000,
    // Demonstrates the Solo Lab's Makro-Linse gadget (src/domain/lab.ts's
    // qualifiesForMacroLens) keyless — real iNat/PlantNet catches carry
    // iconicTaxon from the recognised taxonomy, never subjectBox (always
    // undefined there — see inatMapping.ts).
    iconicTaxon: 'Insecta',
  },
  // ── plants ─────────────────────────────────────────────────────────────
  {
    category: 'plant',
    commonName: 'Common Dandelion',
    scientificName: 'Taraxacum officinale',
    confidence: 0.95,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 620_000,
  },
  {
    category: 'plant',
    commonName: 'Lady\'s Slipper Orchid',
    scientificName: 'Cypripedium calceolus',
    confidence: 0.84,
    captiveStatus: 'wild',
    sensitivity: 'protected',
    observationsCount: 2_400,
  },
  {
    category: 'plant',
    commonName: 'Common Nettle',
    scientificName: 'Urtica dioica',
    confidence: 0.92,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 250_000,
  },
  // ── trees ──────────────────────────────────────────────────────────────
  {
    category: 'tree',
    commonName: 'English Oak',
    scientificName: 'Quercus robur',
    confidence: 0.89,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 155_000,
  },
  {
    category: 'tree',
    commonName: 'Silver Birch',
    scientificName: 'Betula pendula',
    confidence: 0.87,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 90_000,
  },
  {
    category: 'tree',
    commonName: 'Common Yew',
    scientificName: 'Taxus baccata',
    confidence: 0.79,
    captiveStatus: 'wild',
    sensitivity: 'low',
    observationsCount: 45_000,
  },
  // ── mushrooms ──────────────────────────────────────────────────────────
  {
    category: 'mushroom',
    commonName: 'Fly Agaric',
    scientificName: 'Amanita muscaria',
    confidence: 0.94,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 185_000,
  },
  {
    category: 'mushroom',
    commonName: 'Chanterelle',
    scientificName: 'Cantharellus cibarius',
    confidence: 0.82,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 42_000,
  },
  {
    category: 'mushroom',
    commonName: 'King Bolete',
    scientificName: 'Boletus edulis',
    confidence: 0.86,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 36_000,
  },
  // ── UNCURATED — rarity comes purely from the observation curve ──────────
  // None of these are in `speciesRules`, so they take the same path a real
  // uncurated iNat catch takes: observationsCount → rarityFromObservations.
  // They are what makes a mock run produce rare / epic / legendary reveals.
  {
    category: 'animal',
    commonName: 'Common Wall Lizard',
    scientificName: 'Podarcis muralis',
    confidence: 0.83,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 68_000, // → rare
  },
  {
    category: 'animal',
    commonName: 'Alpine Salamander',
    scientificName: 'Salamandra atra',
    confidence: 0.78,
    captiveStatus: 'wild',
    sensitivity: 'sensitive',
    observationsCount: 3_200, // → epic
  },
  {
    category: 'plant',
    commonName: 'Wood Anemone',
    scientificName: 'Anemonoides nemorosa',
    confidence: 0.9,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 135_000, // → uncommon
  },
  {
    category: 'plant',
    commonName: 'Ghost Orchid',
    scientificName: 'Epipogium aphyllum',
    confidence: 0.72,
    captiveStatus: 'wild',
    sensitivity: 'protected',
    observationsCount: 850, // → legendary
  },
  {
    category: 'mushroom',
    commonName: 'Bleeding Tooth Fungus',
    scientificName: 'Hydnellum peckii',
    confidence: 0.8,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount: 4_700, // → epic
  },
];

/** djb2-style hash — deterministic, no deps. Returns a non-negative integer. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  // Force to unsigned 32-bit so we never get a negative index
  return h >>> 0;
}

/** Look up a species table entry by its common name. */
function findSpecies(commonName: string): SpeciesEntry | undefined {
  return SPECIES_TABLE.find((e) => e.commonName === commonName);
}

/**
 * Mock-only hint keys → a concrete species entry. Lets the Capture screen offer
 * a manual "test subject" picker so the simulated result is predictable instead
 * of hash-random. Real providers ignore hints entirely.
 *
 * `MOCK_HINTS` is the source of truth the UI reads to render its picker.
 */
export const MOCK_HINTS = [
  'cat',
  'dog',
  'frog',
  'bird',
  'tree',
  'flower',
  'mushroom',
] as const;

export type MockHint = (typeof MOCK_HINTS)[number];

const HINT_TO_SPECIES: Record<MockHint, string> = {
  cat: 'Domestic Cat',
  dog: 'Domestic Dog',
  frog: 'Common Frog',
  bird: 'European Robin',
  tree: 'English Oak',
  flower: 'Common Dandelion',
  mushroom: 'Fly Agaric',
};

export class MockVisionProvider implements VisionRecognitionProvider {
  async recognize(imageUri: string, hint?: string): Promise<RecognitionResult> {
    // Manual mock pick: if the hint maps to a known species, return it.
    if (hint !== undefined) {
      const key = hint.toLowerCase();
      const mappedName = (HINT_TO_SPECIES as Record<string, string | undefined>)[key];
      const hinted = mappedName !== undefined ? findSpecies(mappedName) : undefined;
      if (hinted !== undefined) {
        return { ...hinted };
      }
      // Unknown hint → fall through to deterministic hashing.
    }

    const index = hashString(imageUri) % SPECIES_TABLE.length;
    const entry = SPECIES_TABLE[index];
    if (entry === undefined) {
      // Fallback — should never happen given the modulo, but satisfies
      // noUncheckedIndexedAccess
      return {
        category: 'unknown',
        commonName: 'Unknown Species',
        confidence: 0.5,
        captiveStatus: 'unknown',
        sensitivity: 'none',
      };
    }
    // Return a shallow copy so callers cannot mutate the table.
    return { ...entry };
  }
}
