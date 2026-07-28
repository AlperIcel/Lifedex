/**
 * Tests for species + location de-duplication (src/domain/dedup.ts).
 *
 * Rule under test: the same species within ~1 km is a blocked re-catch; further
 * away it's a fresh discovery; unmeasurable distance is treated as nearby.
 */
import { evaluateDedup, NEARBY_METERS } from '../src/domain/dedup';
import type { RecognitionResult, Sighting } from '../src/domain/types';

const NOW = Date.parse('2026-06-27T12:00:00.000Z');
const LAST_WEEK = '2026-06-20T09:00:00.000Z';

function sighting(opts: {
  id: string;
  commonName: string;
  scientificName?: string;
  lat: number;
  lng: number;
  createdAt: string;
  hidden?: boolean;
}): Sighting {
  return {
    id: opts.id,
    commonName: opts.commonName,
    scientificName: opts.scientificName,
    createdAt: opts.createdAt,
    publicLocation: {
      lat: opts.lat,
      lng: opts.lng,
      precisionMeters: 200,
      hidden: opts.hidden ?? false,
    },
    rarity: 'common',
  } as unknown as Sighting;
}

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

// ~1° latitude ≈ 111 km, so 0.001° ≈ 111 m — handy for building known distances.
const BASE = { lat: 48.1, lng: 11.5 };

describe('evaluateDedup', () => {
  it('is a fresh discovery when nothing matches', () => {
    const r = evaluateDedup({ recognition: reco('Red Fox'), existing: [], now: NOW });
    expect(r.alreadyDiscovered).toBe(false);
    expect(r.priorCount).toBe(0);
    expect(r.existingSightingId).toBeUndefined();
  });

  it('blocks the same species within ~1 km (nearby re-catch)', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', ...BASE, createdAt: LAST_WEEK })];
    const r = evaluateDedup({
      recognition: reco('red fox'), // case-insensitive
      existing,
      location: { lat: BASE.lat + 0.0001, lng: BASE.lng }, // ~11 m away
      now: NOW,
    });
    expect(r.alreadyDiscovered).toBe(true);
    expect(r.priorCount).toBe(1);
    expect(r.existingSightingId).toBe('s1');
  });

  it('allows the SAME species when it is far away (a new-area discovery)', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', ...BASE, createdAt: LAST_WEEK })];
    const r = evaluateDedup({
      recognition: reco('Red Fox'),
      existing,
      location: { lat: 52.5, lng: 13.4 }, // hundreds of km away (Berlin vs Munich)
      now: NOW,
    });
    expect(r.alreadyDiscovered).toBe(false);
    expect(r.existingSightingId).toBeUndefined();
  });

  it('respects the ~1 km boundary (just under = blocked, just over = allowed)', () => {
    const existing = [sighting({ id: 's1', commonName: 'Oak', ...BASE, createdAt: LAST_WEEK })];
    const under = evaluateDedup({
      recognition: reco('Oak'),
      existing,
      location: { lat: BASE.lat + 0.008, lng: BASE.lng }, // ~889 m
      now: NOW,
    });
    const over = evaluateDedup({
      recognition: reco('Oak'),
      existing,
      location: { lat: BASE.lat + 0.011, lng: BASE.lng }, // ~1222 m
      now: NOW,
    });
    expect(under.alreadyDiscovered).toBe(true);
    expect(over.alreadyDiscovered).toBe(false);
    expect(NEARBY_METERS).toBe(1000);
  });

  it('matches by scientific name when both have one', () => {
    const existing = [
      sighting({ id: 's1', commonName: 'Different Name', scientificName: 'Vulpes vulpes', ...BASE, createdAt: LAST_WEEK }),
    ];
    const r = evaluateDedup({
      recognition: reco('Red Fox', 'vulpes vulpes'),
      existing,
      location: { lat: BASE.lat, lng: BASE.lng },
      now: NOW,
    });
    expect(r.alreadyDiscovered).toBe(true);
  });

  it('blocks when the species exists but the new capture has no location', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', ...BASE, createdAt: LAST_WEEK })];
    const r = evaluateDedup({ recognition: reco('Red Fox'), existing, now: NOW });
    expect(r.alreadyDiscovered).toBe(true); // can't prove you moved → conservative
    expect(r.existingSightingId).toBe('s1');
  });

  it('blocks a protected species whose prior location is hidden (unmeasurable)', () => {
    const existing = [
      sighting({ id: 's1', commonName: 'Wild Orchid', ...BASE, createdAt: LAST_WEEK, hidden: true }),
    ];
    const r = evaluateDedup({
      recognition: reco('Wild Orchid'),
      existing,
      location: { lat: 52.5, lng: 13.4 }, // far, but the prior is hidden → can't trust distance
      now: NOW,
    });
    expect(r.alreadyDiscovered).toBe(true);
  });
});
