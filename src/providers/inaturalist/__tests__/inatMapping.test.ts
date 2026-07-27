/**
 * Tests for the iNaturalist score_image -> RecognitionResult mapping.
 * Pure, no network — every case is a hand-built fixture response.
 */
import {
  MIN_CONFIDENCE,
  mapInatResponse,
  type InatScoreResponse,
} from '../inatMapping';

/** Build a minimal single-result response fixture. */
function oneResult(
  combined_score: number,
  taxon: InatScoreResponse['results'][number]['taxon'],
): InatScoreResponse {
  return { total_results: 1, results: [{ combined_score, taxon }] };
}

describe('mapInatResponse — category from iconic taxon', () => {
  it('maps Aves (and other animal iconics) to animal', () => {
    const r = mapInatResponse(
      oneResult(92, {
        id: 1,
        name: 'Cyanistes caeruleus',
        rank: 'species',
        preferred_common_name: 'Eurasian Blue Tit',
        iconic_taxon_name: 'Aves',
      }),
    );
    expect(r.category).toBe('animal');
    expect(r.commonName).toBe('Eurasian Blue Tit');
    expect(r.scientificName).toBe('Cyanistes caeruleus');
    expect(r.confidence).toBeCloseTo(0.92);
    expect(r.captiveStatus).toBe('wild');
    expect(r.sensitivity).toBe('none');
    expect(r.subjectBox).toBeUndefined();
  });

  it('maps Animalia kingdom iconic to animal', () => {
    const r = mapInatResponse(
      oneResult(80, {
        id: 2,
        name: 'Vulpes vulpes',
        rank: 'species',
        iconic_taxon_name: 'Animalia',
      }),
    );
    expect(r.category).toBe('animal');
  });

  it('maps Plantae to plant', () => {
    const r = mapInatResponse(
      oneResult(70, {
        id: 3,
        name: 'Helianthus annuus',
        rank: 'species',
        preferred_common_name: 'common sunflower',
        iconic_taxon_name: 'Plantae',
      }),
    );
    expect(r.category).toBe('plant');
    expect(r.commonName).toBe('Common Sunflower');
  });

  it('maps a TREE to plant (known boundary: iNat has no tree iconic)', () => {
    const r = mapInatResponse(
      oneResult(75, {
        id: 4,
        name: 'Quercus robur',
        rank: 'species',
        preferred_common_name: 'English Oak',
        iconic_taxon_name: 'Plantae',
      }),
    );
    expect(r.category).toBe('plant');
  });

  it('maps Fungi to mushroom', () => {
    const r = mapInatResponse(
      oneResult(65, {
        id: 5,
        name: 'Amanita muscaria',
        rank: 'species',
        preferred_common_name: 'Fly Agaric',
        iconic_taxon_name: 'Fungi',
      }),
    );
    expect(r.category).toBe('mushroom');
  });

  it('maps an unknown/absent iconic to unknown category (still catchable)', () => {
    const r = mapInatResponse(
      oneResult(55, {
        id: 6,
        name: 'Something obscura',
        rank: 'species',
        iconic_taxon_name: 'Chromista',
      }),
    );
    expect(r.category).toBe('unknown');
    // still a real, confident, genus-or-finer ID — not NO_CATCH
    expect(r.commonName).toBe('Something Obscura');
    expect(r.confidence).toBeCloseTo(0.55);
  });
});

describe('mapInatResponse — scientificName by rank', () => {
  it('uses taxon.name for genus rank', () => {
    const r = mapInatResponse(
      oneResult(60, {
        id: 7,
        name: 'Quercus',
        rank: 'genus',
        preferred_common_name: 'Oaks',
        iconic_taxon_name: 'Plantae',
      }),
    );
    expect(r.scientificName).toBe('Quercus');
  });

  it('uses taxon.name for subspecies rank', () => {
    const r = mapInatResponse(
      oneResult(60, {
        id: 8,
        name: 'Vulpes vulpes fulva',
        rank: 'subspecies',
        iconic_taxon_name: 'Mammalia',
      }),
    );
    expect(r.scientificName).toBe('Vulpes vulpes fulva');
  });

  it('keeps taxon.name as scientificName for a variety rank (finer than species)', () => {
    const r = mapInatResponse(
      oneResult(60, {
        id: 9,
        name: 'Brassica oleracea var. italica',
        rank: 'variety',
        rank_level: 5,
        preferred_common_name: 'Broccoli',
        iconic_taxon_name: 'Plantae',
      }),
    );
    // Past the genus-or-finer gate, taxon.name IS the scientific name.
    expect(r.category).toBe('plant');
    expect(r.scientificName).toBe('Brassica oleracea var. italica');
  });
});

describe('mapInatResponse — malformed wire data (unchecked cast) is safe', () => {
  it('returns NO_CATCH for a missing/NaN combined_score instead of confidence: NaN', () => {
    const bad = {
      total_results: 1,
      results: [
        {
          // combined_score omitted on purpose — parsed JSON can lie about types.
          taxon: { id: 30, name: 'Vulpes vulpes', rank: 'species', iconic_taxon_name: 'Mammalia' },
        },
      ],
    } as unknown as InatScoreResponse;
    const r = mapInatResponse(bad);
    expect(r.category).toBe('unknown');
    expect(r.confidence).toBe(0);
    expect(Number.isNaN(r.confidence)).toBe(false);
  });

  it('returns NO_CATCH when the top result has no taxon (no TypeError)', () => {
    const bad = {
      total_results: 1,
      results: [{ combined_score: 95 }],
    } as unknown as InatScoreResponse;
    expect(() => mapInatResponse(bad)).not.toThrow();
    expect(mapInatResponse(bad).category).toBe('unknown');
  });

  it('accepts a between-genus-and-species rank (complex) with no rank_level', () => {
    const r = mapInatResponse(
      oneResult(70, {
        id: 31,
        name: 'Bombus lucorum complex',
        rank: 'complex',
        preferred_common_name: 'White-tailed Bumblebee Complex',
        iconic_taxon_name: 'Insecta',
      }),
    );
    expect(r.category).toBe('animal');
    expect(r.scientificName).toBe('Bombus lucorum complex');
  });
});

describe('mapInatResponse — commonName fallback + title-case', () => {
  it('falls back to taxon.name when no preferred_common_name', () => {
    const r = mapInatResponse(
      oneResult(50, {
        id: 10,
        name: 'Vulpes vulpes',
        rank: 'species',
        iconic_taxon_name: 'Mammalia',
      }),
    );
    expect(r.commonName).toBe('Vulpes Vulpes');
  });
});

describe('mapInatResponse — thresholds and NO_CATCH', () => {
  const catchable = {
    id: 11,
    name: 'Vulpes vulpes',
    rank: 'species',
    iconic_taxon_name: 'Mammalia',
  } as const;

  it('returns NO_CATCH when there are no results', () => {
    const r = mapInatResponse({ total_results: 0, results: [] });
    expect(r).toEqual({
      category: 'unknown',
      commonName: 'Unknown',
      confidence: 0,
      captiveStatus: 'wild',
      sensitivity: 'none',
    });
  });

  it('returns NO_CATCH when top confidence is below MIN_CONFIDENCE', () => {
    const belowPct = MIN_CONFIDENCE * 100 - 1; // e.g. 9%
    const r = mapInatResponse(oneResult(belowPct, catchable));
    expect(r.category).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('accepts exactly at MIN_CONFIDENCE', () => {
    const r = mapInatResponse(oneResult(MIN_CONFIDENCE * 100, catchable));
    expect(r.category).toBe('animal');
    expect(r.confidence).toBeCloseTo(MIN_CONFIDENCE);
  });

  it('returns NO_CATCH when the top taxon is coarser than genus (family)', () => {
    const r = mapInatResponse(
      oneResult(95, {
        id: 12,
        name: 'Canidae',
        rank: 'family',
        rank_level: 30,
        iconic_taxon_name: 'Mammalia',
      }),
    );
    expect(r.category).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('uses rank name when rank_level is absent (order -> NO_CATCH)', () => {
    const r = mapInatResponse(
      oneResult(95, {
        id: 13,
        name: 'Carnivora',
        rank: 'order',
        iconic_taxon_name: 'Mammalia',
      }),
    );
    expect(r.category).toBe('unknown');
  });

  it('clamps confidence to 1 for an out-of-range combined_score', () => {
    const r = mapInatResponse(oneResult(140, catchable));
    expect(r.confidence).toBe(1);
  });
});

describe('mapInatResponse — top result selection', () => {
  it('picks the highest combined_score even if unsorted', () => {
    const res: InatScoreResponse = {
      total_results: 2,
      results: [
        {
          combined_score: 30,
          taxon: { id: 20, name: 'Wrong species', rank: 'species', iconic_taxon_name: 'Aves' },
        },
        {
          combined_score: 88,
          taxon: {
            id: 21,
            name: 'Right species',
            rank: 'species',
            preferred_common_name: 'Right Bird',
            iconic_taxon_name: 'Aves',
          },
        },
      ],
    };
    const r = mapInatResponse(res);
    expect(r.commonName).toBe('Right Bird');
    expect(r.confidence).toBeCloseTo(0.88);
  });
});
