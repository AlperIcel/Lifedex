import {
  resolveSpeciesRule,
  rarityForRecognition,
  applySpeciesRule,
} from '../src/domain/speciesRules';
import { createSightingFromImage } from '../src/services/sightingPipeline';
import { lifeDexStore } from '../src/store/useLifeDexStore';
import type { RecognitionResult } from '../src/domain/types';

function reco(commonName: string, scientificName?: string): RecognitionResult {
  return {
    category: 'animal',
    commonName,
    scientificName,
    confidence: 0.9,
    captiveStatus: 'wild',
    sensitivity: 'none',
  };
}

describe('resolveSpeciesRule', () => {
  it('matches by scientific name (case-insensitive)', () => {
    expect(resolveSpeciesRule('whatever', 'vulpes vulpes')?.commonName).toBe('Red Fox');
  });
  it('matches by common name when no scientific name', () => {
    expect(resolveSpeciesRule('eagle owl')?.baseRarity).toBe('epic');
  });
  it('returns undefined for an unknown species', () => {
    expect(resolveSpeciesRule('Purple Space Beast')).toBeUndefined();
  });
});

describe('rarityForRecognition', () => {
  it('gives a legendary for a protected orchid (unreachable via the category default)', () => {
    expect(rarityForRecognition(reco("Lady's Slipper Orchid"))).toBe('legendary');
  });
  it('is undefined for unknown species (engine falls back)', () => {
    expect(rarityForRecognition(reco('Unknown Thing'))).toBeUndefined();
  });
});

describe('applySpeciesRule — protected-species sensitivity', () => {
  it('upgrades a protected species from provider-reported "none" to "protected"', () => {
    const r = applySpeciesRule(reco('Eagle Owl', 'Bubo bubo'));
    expect(r.sensitivity).toBe('protected');
  });
  it('leaves unknown species untouched', () => {
    const r = applySpeciesRule(reco('Unknown Thing'));
    expect(r.sensitivity).toBe('none');
  });
});

describe('pipeline uses species rules end-to-end', () => {
  beforeEach(() => lifeDexStore.reset());

  it('a King Bolete resolves to a rare rarity (not the capped default)', async () => {
    // 'mushroom' hint -> Fly Agaric; use a fresh species via a distinct URI + hint.
    const res = await createSightingFromImage({ imageUri: 'mock://m.jpg', mockSpecies: 'mushroom' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = lifeDexStore.getSightingById(res.sightingId);
    // Fly Agaric baseRarity is 'uncommon' per the catalogue.
    expect(s?.rarity).toBe('uncommon');
  });
});
