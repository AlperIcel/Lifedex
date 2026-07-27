/**
 * Tests for the PlantNet -> RecognitionResult mapping (pure, no network).
 *
 * Fixtures mirror the real `/v2/identify/all` payload shape (results sorted
 * best-first, `species.{scientificNameWithoutAuthor,genus,family,commonNames}`).
 */
import {
  MIN_CONFIDENCE,
  TREE_FAMILIES,
  mapPlantNetResponse,
  type PlantNetResponse,
  type PlantNetResult,
} from '../plantnetMapping';

/** Small fixture builder so each test states only what it is about. */
function response(
  opts: {
    score?: number;
    scientific?: string;
    family?: string;
    genus?: string;
    commonNames?: string[];
  },
  ...more: PlantNetResult[]
): PlantNetResponse {
  const {
    score = 0.9,
    scientific = 'Helianthus annuus',
    family,
    genus,
    commonNames,
  } = opts;
  return {
    results: [
      {
        score,
        species: {
          scientificNameWithoutAuthor: scientific,
          scientificNameAuthorship: 'L.',
          ...(genus !== undefined
            ? { genus: { scientificNameWithoutAuthor: genus } }
            : {}),
          ...(family !== undefined
            ? { family: { scientificNameWithoutAuthor: family } }
            : {}),
          ...(commonNames !== undefined ? { commonNames } : {}),
        },
      },
      ...more,
    ],
  };
}

describe('mapPlantNetResponse — category', () => {
  it('defaults to plant for a non-tree family', () => {
    const r = mapPlantNetResponse(
      response({ family: 'Asteraceae', commonNames: ['common sunflower'] }),
    );
    expect(r.category).toBe('plant');
  });

  it('defaults to plant when no family is present at all', () => {
    const r = mapPlantNetResponse(response({ commonNames: ['sunflower'] }));
    expect(r.category).toBe('plant');
  });

  it.each(TREE_FAMILIES)('classifies %s as a tree', (family) => {
    const r = mapPlantNetResponse(response({ family }));
    expect(r.category).toBe('tree');
  });

  it('matches tree families case-insensitively and ignores stray whitespace', () => {
    const r = mapPlantNetResponse(response({ family: '  fagaceae ' }));
    expect(r.category).toBe('tree');
  });

  it('never returns mushroom or animal, even for a fungus-sounding name', () => {
    const r = mapPlantNetResponse(
      response({ scientific: 'Amanita muscaria', commonNames: ['fly agaric mushroom'] }),
    );
    // PlantNet is flora-only: a fungus fixture still maps to plant, never
    // 'mushroom' — fungi identification is iNaturalist's job.
    expect(r.category).toBe('plant');
  });
});

describe('mapPlantNetResponse — names', () => {
  it('uses the first common name, title-cased', () => {
    const r = mapPlantNetResponse(
      response({
        scientific: 'Quercus robur',
        family: 'Fagaceae',
        commonNames: ['english oak', 'pedunculate oak'],
      }),
    );
    expect(r.commonName).toBe('English Oak');
    expect(r.scientificName).toBe('Quercus robur');
  });

  it('falls back to the scientific name verbatim when no common names exist', () => {
    const r = mapPlantNetResponse(response({ scientific: 'Helianthus annuus' }));
    // Binomial casing must survive: "Helianthus annuus", NOT "Helianthus Annuus".
    expect(r.commonName).toBe('Helianthus annuus');
  });

  it('skips an empty commonNames array and blank entries', () => {
    expect(
      mapPlantNetResponse(response({ scientific: 'Acer campestre', commonNames: [] })).commonName,
    ).toBe('Acer campestre');
    expect(
      mapPlantNetResponse(
        response({ scientific: 'Acer campestre', commonNames: ['   ', 'field maple'] }),
      ).commonName,
    ).toBe('Field Maple');
  });

  it('drops the authorship from the scientific name', () => {
    const r = mapPlantNetResponse(response({ scientific: 'Bellis perennis' }));
    expect(r.scientificName).toBe('Bellis perennis');
    expect(r.scientificName).not.toContain('L.');
  });

  it('reports Unknown when even the scientific name is blank', () => {
    const r = mapPlantNetResponse(response({ scientific: '   ' }));
    expect(r.commonName).toBe('Unknown');
    expect(r.scientificName).toBeUndefined();
  });
});

describe('mapPlantNetResponse — confidence and threshold', () => {
  it('takes the top result score as confidence', () => {
    const r = mapPlantNetResponse(response({ score: 0.73 }));
    expect(r.confidence).toBeCloseTo(0.73);
  });

  it('ignores lower-scoring runner-up results', () => {
    const res = response(
      { score: 0.64, scientific: 'Quercus robur', family: 'Fagaceae', commonNames: ['english oak'] },
      {
        score: 0.2,
        species: {
          scientificNameWithoutAuthor: 'Bellis perennis',
          commonNames: ['daisy'],
        },
      },
    );
    const r = mapPlantNetResponse(res);
    expect(r.commonName).toBe('English Oak');
    expect(r.confidence).toBeCloseTo(0.64);
  });

  it('clamps an out-of-range score into 0..1', () => {
    expect(mapPlantNetResponse(response({ score: 1.7 })).confidence).toBe(1);
    // A negative score is below the threshold, so it becomes the unknown result.
    expect(mapPlantNetResponse(response({ score: -0.5 })).confidence).toBe(0);
    expect(mapPlantNetResponse(response({ score: -0.5 })).category).toBe('unknown');
  });

  it('returns unknown below MIN_CONFIDENCE', () => {
    const r = mapPlantNetResponse(response({ score: MIN_CONFIDENCE - 0.01 }));
    expect(r).toEqual({
      category: 'unknown',
      commonName: 'Unknown',
      scientificName: undefined,
      confidence: 0,
      captiveStatus: 'wild',
      sensitivity: 'none',
      subjectBox: undefined,
    });
  });

  it('accepts a score exactly at MIN_CONFIDENCE', () => {
    const r = mapPlantNetResponse(response({ score: MIN_CONFIDENCE }));
    expect(r.category).toBe('plant');
    expect(r.confidence).toBeCloseTo(MIN_CONFIDENCE);
  });

  it('returns unknown for an empty results array', () => {
    expect(mapPlantNetResponse({ results: [] }).category).toBe('unknown');
  });

  it('returns unknown for a response with no results field', () => {
    const r = mapPlantNetResponse({});
    expect(r.category).toBe('unknown');
    expect(r.commonName).toBe('Unknown');
    expect(r.confidence).toBe(0);
  });
});

describe('mapPlantNetResponse — fixed fields', () => {
  it('always reports wild / none / no subject box', () => {
    const r = mapPlantNetResponse(
      response({ family: 'Pinaceae', commonNames: ['scots pine'], scientific: 'Pinus sylvestris' }),
    );
    expect(r.captiveStatus).toBe('wild');
    expect(r.sensitivity).toBe('none');
    expect(r.subjectBox).toBeUndefined();
  });
});

describe('mapPlantNetResponse — real-shaped fixture', () => {
  // Shape of an actual /v2/identify/all answer for a photo of an oak leaf.
  const oak: PlantNetResponse = {
    results: [
      {
        score: 0.4821,
        species: {
          scientificNameWithoutAuthor: 'Quercus robur',
          scientificNameAuthorship: 'L.',
          genus: { scientificNameWithoutAuthor: 'Quercus' },
          family: { scientificNameWithoutAuthor: 'Fagaceae' },
          commonNames: ['English oak', 'Pedunculate oak', 'Truffle oak'],
        },
      },
      {
        score: 0.1712,
        species: {
          scientificNameWithoutAuthor: 'Quercus petraea',
          scientificNameAuthorship: '(Matt.) Liebl.',
          genus: { scientificNameWithoutAuthor: 'Quercus' },
          family: { scientificNameWithoutAuthor: 'Fagaceae' },
          commonNames: ['Sessile oak'],
        },
      },
    ],
  };

  it('maps the oak fixture end to end', () => {
    expect(mapPlantNetResponse(oak)).toEqual({
      category: 'tree',
      commonName: 'English Oak',
      scientificName: 'Quercus robur',
      confidence: 0.4821,
      captiveStatus: 'wild',
      sensitivity: 'none',
      subjectBox: undefined,
    });
  });
});

describe('mapPlantNetResponse — malformed wire data (unchecked cast) is safe', () => {
  it('returns unknown for a missing/NaN score instead of confidence: NaN', () => {
    const bad = {
      results: [{ species: { scientificNameWithoutAuthor: 'Helianthus annuus' } }],
    } as unknown as PlantNetResponse;
    const r = mapPlantNetResponse(bad);
    expect(r.category).toBe('unknown');
    expect(r.confidence).toBe(0);
    expect(Number.isNaN(r.confidence)).toBe(false);
  });

  it('returns unknown when the top result has no species (no TypeError)', () => {
    const bad = { results: [{ score: 0.9 }] } as unknown as PlantNetResponse;
    expect(() => mapPlantNetResponse(bad)).not.toThrow();
    expect(mapPlantNetResponse(bad).category).toBe('unknown');
  });

  it('tolerates a non-array commonNames without throwing', () => {
    const bad = {
      results: [
        {
          score: 0.9,
          species: {
            scientificNameWithoutAuthor: 'Quercus robur',
            family: { scientificNameWithoutAuthor: 'Fagaceae' },
            commonNames: 'English Oak',
          },
        },
      ],
    } as unknown as PlantNetResponse;
    const r = mapPlantNetResponse(bad);
    expect(r.category).toBe('tree');
    // non-array commonNames ignored → falls back to the scientific name verbatim
    expect(r.commonName).toBe('Quercus robur');
    expect(r.scientificName).toBe('Quercus robur');
  });
});
