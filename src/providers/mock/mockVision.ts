/**
 * Mock VisionRecognitionProvider — no API keys required.
 *
 * Deterministically picks a species entry from the built-in table by hashing
 * the imageUri string so repeated calls with the same URI always return the
 * same result (useful for tests and UI demos). The hash is a simple djb2
 * variant — no crypto dependency needed.
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
  },
  {
    category: 'animal',
    commonName: 'Red Fox',
    scientificName: 'Vulpes vulpes',
    confidence: 0.88,
    captiveStatus: 'wild',
    sensitivity: 'low',
  },
  {
    category: 'animal',
    commonName: 'Great Spotted Woodpecker',
    scientificName: 'Dendrocopos major',
    confidence: 0.81,
    captiveStatus: 'wild',
    sensitivity: 'low',
  },
  {
    category: 'animal',
    commonName: 'Common Frog',
    scientificName: 'Rana temporaria',
    confidence: 0.76,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  {
    category: 'animal',
    commonName: 'Eagle Owl',
    scientificName: 'Bubo bubo',
    confidence: 0.91,
    captiveStatus: 'wild',
    sensitivity: 'protected',
  },
  {
    category: 'animal',
    commonName: 'Domestic Cat',
    scientificName: 'Felis catus',
    confidence: 0.97,
    captiveStatus: 'domestic',
    sensitivity: 'none',
  },
  // ── plants ─────────────────────────────────────────────────────────────
  {
    category: 'plant',
    commonName: 'Common Dandelion',
    scientificName: 'Taraxacum officinale',
    confidence: 0.95,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  {
    category: 'plant',
    commonName: 'Lady\'s Slipper Orchid',
    scientificName: 'Cypripedium calceolus',
    confidence: 0.84,
    captiveStatus: 'wild',
    sensitivity: 'protected',
  },
  {
    category: 'plant',
    commonName: 'Common Nettle',
    scientificName: 'Urtica dioica',
    confidence: 0.92,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  // ── trees ──────────────────────────────────────────────────────────────
  {
    category: 'tree',
    commonName: 'English Oak',
    scientificName: 'Quercus robur',
    confidence: 0.89,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  {
    category: 'tree',
    commonName: 'Silver Birch',
    scientificName: 'Betula pendula',
    confidence: 0.87,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  {
    category: 'tree',
    commonName: 'Common Yew',
    scientificName: 'Taxus baccata',
    confidence: 0.79,
    captiveStatus: 'wild',
    sensitivity: 'low',
  },
  // ── mushrooms ──────────────────────────────────────────────────────────
  {
    category: 'mushroom',
    commonName: 'Fly Agaric',
    scientificName: 'Amanita muscaria',
    confidence: 0.94,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  {
    category: 'mushroom',
    commonName: 'Chanterelle',
    scientificName: 'Cantharellus cibarius',
    confidence: 0.82,
    captiveStatus: 'wild',
    sensitivity: 'none',
  },
  {
    category: 'mushroom',
    commonName: 'King Bolete',
    scientificName: 'Boletus edulis',
    confidence: 0.86,
    captiveStatus: 'wild',
    sensitivity: 'none',
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

export class MockVisionProvider implements VisionRecognitionProvider {
  async recognize(imageUri: string): Promise<RecognitionResult> {
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
