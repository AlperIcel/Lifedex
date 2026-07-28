/**
 * Tests for computeStats (src/domain/stats.ts) — pure aggregate counters.
 */
import { computeStats, uniqueSpeciesKey } from '../src/domain/stats';
import type { Sighting } from '../src/domain/types';

let seq = 0;

/** Builds a minimally-valid Sighting; only the fields computeStats reads matter. */
function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    id: `s${seq}`,
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    category: 'animal',
    commonName: `Species ${seq}`,
    scientificName: undefined,
    confidence: 0.9,
    rarity: 'common',
    xp: 10,
    captiveStatus: 'wild',
    sensitivity: 'none',
    privatePhotoUri: 'file:///private/x.jpg',
    publicImageUri: 'mock-card://animal',
    publicLocation: { lat: 0, lng: 0, precisionMeters: 100, hidden: false },
    card: { name: `Species ${seq}`, category: 'animal', rarity: 'common', xp: 10, description: 'x', stats: {} },
    moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
    ...overrides,
  };
}

describe('computeStats', () => {
  it('returns all-zero stats for an empty collection', () => {
    const stats = computeStats([]);
    expect(stats.totalFinds).toBe(0);
    expect(stats.totalSpecies).toBe(0);
    expect(stats.byCategory).toEqual({ animal: 0, plant: 0, tree: 0, mushroom: 0, unknown: 0 });
    expect(stats.byRarity).toEqual({ common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 });
  });

  it('totalFinds counts every sighting, including repeats of the same species', () => {
    const sightings = [
      makeSighting({ commonName: 'Red Fox' }),
      makeSighting({ commonName: 'Red Fox' }),
      makeSighting({ commonName: 'Red Fox' }),
    ];
    expect(computeStats(sightings).totalFinds).toBe(3);
  });

  it('totalSpecies dedupes by scientificName when present (case-insensitive)', () => {
    const sightings = [
      makeSighting({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' }),
      makeSighting({ commonName: 'Renard roux', scientificName: 'VULPES VULPES' }), // same species, different common name
    ];
    const stats = computeStats(sightings);
    expect(stats.totalFinds).toBe(2);
    expect(stats.totalSpecies).toBe(1);
  });

  it('totalSpecies falls back to commonName (case-insensitive) when scientificName is absent', () => {
    const sightings = [
      makeSighting({ commonName: 'Fly Agaric', scientificName: undefined }),
      makeSighting({ commonName: 'fly agaric', scientificName: undefined }),
      makeSighting({ commonName: 'Chanterelle', scientificName: undefined }),
    ];
    const stats = computeStats(sightings);
    expect(stats.totalSpecies).toBe(2);
  });

  it('counts sightings per category', () => {
    const sightings = [
      makeSighting({ category: 'animal' }),
      makeSighting({ category: 'animal' }),
      makeSighting({ category: 'plant' }),
      makeSighting({ category: 'tree' }),
      makeSighting({ category: 'mushroom' }),
      makeSighting({ category: 'unknown' }),
    ];
    const stats = computeStats(sightings);
    expect(stats.byCategory).toEqual({ animal: 2, plant: 1, tree: 1, mushroom: 1, unknown: 1 });
  });

  it('counts sightings per rarity', () => {
    const sightings = [
      makeSighting({ rarity: 'common' }),
      makeSighting({ rarity: 'common' }),
      makeSighting({ rarity: 'rare' }),
      makeSighting({ rarity: 'epic' }),
      makeSighting({ rarity: 'legendary' }),
    ];
    const stats = computeStats(sightings);
    expect(stats.byRarity).toEqual({ common: 2, uncommon: 0, rare: 1, epic: 1, legendary: 1 });
  });
});

describe('uniqueSpeciesKey', () => {
  it('prefers scientificName over commonName', () => {
    const s = makeSighting({ commonName: 'Red Fox', scientificName: 'Vulpes Vulpes' });
    expect(uniqueSpeciesKey(s)).toBe('vulpes vulpes');
  });

  it('falls back to commonName when scientificName is absent', () => {
    const s = makeSighting({ commonName: 'Red Fox', scientificName: undefined });
    expect(uniqueSpeciesKey(s)).toBe('red fox');
  });
});
