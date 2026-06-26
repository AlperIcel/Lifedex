/**
 * Sanity test for the domain contract. Verifies the shared schemas accept valid
 * data and reject malformed data, so downstream agents can rely on them.
 */
import {
  GeoPointSchema,
  RaritySchema,
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
});
