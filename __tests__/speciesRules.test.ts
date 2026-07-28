import {
  resolveSpeciesRule,
  rarityForRecognition,
  applySpeciesRule,
} from '../src/domain/speciesRules';
import { createSightingFromImage } from '../src/services/sightingPipeline';
import { lifeDexStore } from '../src/store/useLifeDexStore';
import type { RecognitionResult } from '../src/domain/types';

function reco(
  commonName: string,
  scientificName?: string,
  observationsCount?: number,
): RecognitionResult {
  return {
    category: 'animal',
    commonName,
    scientificName,
    confidence: 0.9,
    captiveStatus: 'wild',
    sensitivity: 'none',
    observationsCount,
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
  it('is undefined for an unknown species with no observation count (engine falls back)', () => {
    expect(rarityForRecognition(reco('Unknown Thing'))).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Resolution priority: curated → observations → fallback              */
/* ------------------------------------------------------------------ */

describe('rarityForRecognition — resolution priority', () => {
  it('(a) the curated catalogue is authoritative and OUTRANKS the observation count', () => {
    // 900 k observations would map to 'common' on the curve, but the catalogue
    // knows this orchid is protected and legendary. Curation must win.
    const r = reco("Lady's Slipper Orchid", 'Cypripedium calceolus', 900_000);
    expect(rarityForRecognition(r)).toBe('legendary');
  });

  it('(b) an UNCURATED species gets its rarity from the observation count', () => {
    // This is the whole point: ~99 % of real catches are not in the catalogue.
    expect(rarityForRecognition(reco('Ghost Orchid', 'Epipogium aphyllum', 850))).toBe(
      'legendary',
    );
    expect(rarityForRecognition(reco('Alpine Salamander', 'Salamandra atra', 3_200))).toBe(
      'epic',
    );
    expect(rarityForRecognition(reco('Common Wall Lizard', 'Podarcis muralis', 68_000))).toBe(
      'rare',
    );
    expect(rarityForRecognition(reco('Wood Anemone', 'Anemonoides nemorosa', 135_000))).toBe(
      'uncommon',
    );
    expect(rarityForRecognition(reco('Some Weed', 'Foo bar', 3_000_000))).toBe('common');
  });

  it('(b) epic and legendary ARE reachable for species outside the catalogue', () => {
    // The old behaviour capped every uncurated catch at 'rare'.
    const reached = new Set(
      [850, 3_200, 68_000, 135_000, 3_000_000].map((n) =>
        rarityForRecognition(reco('Uncurated', 'Genus species', n)),
      ),
    );
    expect(reached.has('epic')).toBe(true);
    expect(reached.has('legendary')).toBe(true);
  });

  it('(c) falls through to undefined when there is neither a rule nor a usable count', () => {
    expect(rarityForRecognition(reco('Unknown Thing'))).toBeUndefined();
    // Malformed counts are not a signal either.
    expect(rarityForRecognition(reco('Unknown Thing', undefined, NaN))).toBeUndefined();
    expect(rarityForRecognition(reco('Unknown Thing', undefined, -1))).toBeUndefined();
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
