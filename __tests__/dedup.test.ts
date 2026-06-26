/**
 * Tests for species-level de-duplication (src/domain/dedup.ts).
 */
import { evaluateDedup } from '../src/domain/dedup';
import type { RecognitionResult, Sighting } from '../src/domain/types';

const NOW = Date.parse('2026-06-27T12:00:00.000Z');
const TODAY = '2026-06-27T09:00:00.000Z';
const LAST_WEEK = '2026-06-20T09:00:00.000Z';

function sighting(opts: {
  id: string;
  commonName: string;
  scientificName?: string;
  lat: number;
  lng: number;
  createdAt: string;
}): Sighting {
  return {
    id: opts.id,
    commonName: opts.commonName,
    scientificName: opts.scientificName,
    createdAt: opts.createdAt,
    publicLocation: { lat: opts.lat, lng: opts.lng, precisionMeters: 200, hidden: false },
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

describe('evaluateDedup', () => {
  it('is a new discovery when nothing matches', () => {
    const r = evaluateDedup({ recognition: reco('Red Fox'), existing: [], now: NOW });
    expect(r.alreadyDiscovered).toBe(false);
    expect(r.priorCount).toBe(0);
    expect(r.existingSightingId).toBeUndefined();
  });

  it('detects an already-discovered species by common name (case-insensitive)', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', lat: 0, lng: 0, createdAt: LAST_WEEK })];
    const r = evaluateDedup({ recognition: reco('red fox'), existing, now: NOW });
    expect(r.alreadyDiscovered).toBe(true);
    expect(r.priorCount).toBe(1);
    expect(r.existingSightingId).toBe('s1');
  });

  it('matches by scientific name when both have one', () => {
    const existing = [
      sighting({ id: 's1', commonName: 'Different Name', scientificName: 'Vulpes vulpes', lat: 0, lng: 0, createdAt: LAST_WEEK }),
    ];
    const r = evaluateDedup({ recognition: reco('Red Fox', 'vulpes vulpes'), existing, now: NOW });
    expect(r.alreadyDiscovered).toBe(true);
  });

  it('flags sameSpotToday when a prior is nearby and within a day', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', lat: 48.1, lng: 11.5, createdAt: TODAY })];
    const r = evaluateDedup({
      recognition: reco('Red Fox'),
      existing,
      location: { lat: 48.1001, lng: 11.5001 }, // ~13 m away
      now: NOW,
    });
    expect(r.sameSpotToday).toBe(true);
  });

  it('does NOT flag sameSpotToday when the prior is far away', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', lat: 48.1, lng: 11.5, createdAt: TODAY })];
    const r = evaluateDedup({
      recognition: reco('Red Fox'),
      existing,
      location: { lat: 52.5, lng: 13.4 }, // hundreds of km away
      now: NOW,
    });
    expect(r.alreadyDiscovered).toBe(true);
    expect(r.sameSpotToday).toBe(false);
  });

  it('does NOT flag sameSpotToday when the prior is from last week', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', lat: 48.1, lng: 11.5, createdAt: LAST_WEEK })];
    const r = evaluateDedup({
      recognition: reco('Red Fox'),
      existing,
      location: { lat: 48.1, lng: 11.5 },
      now: NOW,
    });
    expect(r.sameSpotToday).toBe(false);
  });

  it('treats same-day same-species with no location as same spot', () => {
    const existing = [sighting({ id: 's1', commonName: 'Red Fox', lat: 48.1, lng: 11.5, createdAt: TODAY })];
    const r = evaluateDedup({ recognition: reco('Red Fox'), existing, now: NOW });
    expect(r.sameSpotToday).toBe(true);
  });
});
