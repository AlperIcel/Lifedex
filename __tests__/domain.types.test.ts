/**
 * Sanity test for the domain contract. Verifies the shared schemas accept valid
 * data and reject malformed data, so downstream agents can rely on them.
 */
import {
  GeoPointSchema,
  RaritySchema,
  RecognitionResultSchema,
  ScoreInputSchema,
  ScoreResultSchema,
  SightingSchema,
} from '@/domain/types';

describe('domain types', () => {
  it('accepts a valid GeoPoint', () => {
    expect(() => GeoPointSchema.parse({ lat: 52.52, lng: 13.405 })).not.toThrow();
  });

  it('rejects out-of-range latitude', () => {
    expect(() => GeoPointSchema.parse({ lat: 200, lng: 0 })).toThrow();
  });

  it('rejects an unknown rarity', () => {
    expect(() => RaritySchema.parse('mythic')).toThrow();
  });

  it('rejects negative xp in a ScoreResult', () => {
    expect(() =>
      ScoreResultSchema.parse({ xp: -5, rarity: 'common', reason: 'x' }),
    ).toThrow();
  });

  it('validates a full Sighting row shape', () => {
    const row = {
      id: 's1',
      userId: 'u1',
      createdAt: new Date().toISOString(),
      category: 'animal',
      commonName: 'European Robin',
      confidence: 0.9,
      rarity: 'uncommon',
      xp: 120,
      captiveStatus: 'wild',
      sensitivity: 'low',
      privatePhotoUri: 'file:///private.jpg',
      publicImageUri: 'file:///card.png',
      publicLocation: { lat: 52.5, lng: 13.4, precisionMeters: 500, hidden: false },
      card: {
        name: 'European Robin',
        category: 'animal',
        rarity: 'uncommon',
        xp: 120,
        description: 'A small insectivorous passerine.',
        stats: { wingspan: '20-22cm' },
      },
      moderation: {
        allowed: true,
        reasons: [],
        strippedRegions: [],
        qualityOk: true,
      },
    };
    expect(() => SightingSchema.parse(row)).not.toThrow();
  });

  describe('RecognitionResult.observationsCount', () => {
    const base = {
      category: 'animal',
      commonName: 'Ghost Orchid',
      confidence: 0.8,
      captiveStatus: 'wild',
      sensitivity: 'none',
    };

    it('is optional (a catch works with no rarity signal)', () => {
      expect(() => RecognitionResultSchema.parse(base)).not.toThrow();
    });

    it('accepts a non-negative integer count', () => {
      expect(() =>
        RecognitionResultSchema.parse({ ...base, observationsCount: 0 }),
      ).not.toThrow();
      expect(() =>
        RecognitionResultSchema.parse({ ...base, observationsCount: 850 }),
      ).not.toThrow();
    });

    it('rejects negative or fractional counts', () => {
      expect(() =>
        RecognitionResultSchema.parse({ ...base, observationsCount: -1 }),
      ).toThrow();
      expect(() =>
        RecognitionResultSchema.parse({ ...base, observationsCount: 12.5 }),
      ).toThrow();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Solo Lab additions: RecognitionResult.iconicTaxon/taxonId,          */
  /* Sighting.observationsCount/taxonId, ScoreInput.macroLens             */
  /* ------------------------------------------------------------------ */

  describe('RecognitionResult.iconicTaxon / taxonId', () => {
    const base = {
      category: 'animal',
      commonName: 'Ghost Orchid',
      confidence: 0.8,
      captiveStatus: 'wild',
      sensitivity: 'none',
    };

    it('are both optional', () => {
      expect(() => RecognitionResultSchema.parse(base)).not.toThrow();
    });

    it('accepts a valid iconicTaxon + taxonId together', () => {
      expect(() =>
        RecognitionResultSchema.parse({ ...base, iconicTaxon: 'Insecta', taxonId: 42 }),
      ).not.toThrow();
    });

    it('rejects a non-positive or fractional taxonId', () => {
      expect(() => RecognitionResultSchema.parse({ ...base, taxonId: 0 })).toThrow();
      expect(() => RecognitionResultSchema.parse({ ...base, taxonId: -1 })).toThrow();
      expect(() => RecognitionResultSchema.parse({ ...base, taxonId: 1.5 })).toThrow();
    });
  });

  describe('Sighting.observationsCount / taxonId (old rows still parse)', () => {
    const oldRow = {
      id: 's1',
      userId: 'u1',
      createdAt: new Date().toISOString(),
      category: 'animal',
      commonName: 'European Robin',
      confidence: 0.9,
      rarity: 'uncommon',
      xp: 120,
      captiveStatus: 'wild',
      sensitivity: 'low',
      privatePhotoUri: 'file:///private.jpg',
      publicImageUri: 'file:///card.png',
      publicLocation: { lat: 52.5, lng: 13.4, precisionMeters: 500, hidden: false },
      card: {
        name: 'European Robin',
        category: 'animal',
        rarity: 'uncommon',
        xp: 120,
        description: 'A small insectivorous passerine.',
        stats: { wingspan: '20-22cm' },
      },
      moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
      // NOTE: no observationsCount/taxonId — simulates a row persisted before
      // the Solo Lab shipped these fields.
    };

    it('an old persisted row WITHOUT observationsCount/taxonId still parses', () => {
      expect(() => SightingSchema.parse(oldRow)).not.toThrow();
    });

    it('accepts valid observationsCount/taxonId when present', () => {
      expect(() =>
        SightingSchema.parse({ ...oldRow, observationsCount: 500, taxonId: 12_345 }),
      ).not.toThrow();
    });

    it('rejects a negative/fractional observationsCount or a non-positive/fractional taxonId', () => {
      expect(() => SightingSchema.parse({ ...oldRow, observationsCount: -1 })).toThrow();
      expect(() => SightingSchema.parse({ ...oldRow, observationsCount: 1.5 })).toThrow();
      expect(() => SightingSchema.parse({ ...oldRow, taxonId: 0 })).toThrow();
      expect(() => SightingSchema.parse({ ...oldRow, taxonId: 1.5 })).toThrow();
    });
  });

  describe('ScoreInput.macroLens', () => {
    const validInput = {
      recognition: {
        category: 'animal',
        commonName: 'Peacock Butterfly',
        confidence: 0.8,
        captiveStatus: 'wild',
        sensitivity: 'none',
      },
      confidence: 0.8,
      isDuplicate: false,
      captiveStatus: 'wild',
      sensitivity: 'none',
      qualityOk: true,
      isFirstDiscovery: false,
      streak: 0,
    };

    it('is optional — an old ScoreInput without it still parses', () => {
      expect(() => ScoreInputSchema.parse(validInput)).not.toThrow();
    });

    it('accepts a boolean when present', () => {
      expect(() => ScoreInputSchema.parse({ ...validInput, macroLens: true })).not.toThrow();
      expect(() => ScoreInputSchema.parse({ ...validInput, macroLens: false })).not.toThrow();
    });
  });
});
