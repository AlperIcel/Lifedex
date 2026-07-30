/**
 * Tests for computeAchievements (src/domain/achievements.ts) — pure, no I/O.
 */
import { computeAchievements, type Achievement } from '../src/domain/achievements';
import type { Category, Sighting } from '../src/domain/types';

let seq = 0;

/** Builds a minimally-valid Sighting; only the fields computeAchievements reads matter. */
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

/** N sightings of N distinct species (no scientificName -> commonName is the key). */
function distinctSightings(count: number, overrides: Partial<Sighting> = {}): Sighting[] {
  return Array.from({ length: count }, (_, i) => makeSighting({ commonName: `Unique ${i}`, ...overrides }));
}

function findAch(list: Achievement[], id: string): Achievement {
  const a = list.find((x) => x.id === id);
  if (a === undefined) throw new Error(`achievement "${id}" not found in catalogue`);
  return a;
}

/* ------------------------------------------------------------------ */
/* Catalogue shape                                                     */
/* ------------------------------------------------------------------ */

describe('computeAchievements — catalogue shape', () => {
  it('returns a stable ~13-15 entry catalogue with unique ids (12 original + 3 Solo Lab)', () => {
    const list = computeAchievements([], 0);
    expect(list.length).toBeGreaterThanOrEqual(13);
    expect(list.length).toBeLessThanOrEqual(15);
    expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
  });

  it('every achievement has a valid icon name and internally-consistent progress', () => {
    const list = computeAchievements([], 0);
    for (const a of list) {
      expect(typeof a.icon).toBe('string');
      expect(a.icon.length).toBeGreaterThan(0);
      expect(a.progress.target).toBeGreaterThan(0);
      expect(a.progress.current).toBeGreaterThanOrEqual(0);
      expect(a.progress.current).toBeLessThanOrEqual(a.progress.target);
      expect(a.unlocked).toBe(a.progress.current >= a.progress.target);
    }
  });

  it('is deterministic: the same inputs produce the same output', () => {
    const sightings = distinctSightings(5);
    expect(computeAchievements(sightings, 3)).toEqual(computeAchievements(sightings, 3));
  });
});

/* ------------------------------------------------------------------ */
/* Empty collection                                                    */
/* ------------------------------------------------------------------ */

describe('computeAchievements — empty collection', () => {
  it('locks every achievement with zero progress', () => {
    const list = computeAchievements([], 0);
    for (const a of list) {
      expect(a.unlocked).toBe(false);
      expect(a.progress.current).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Volume thresholds: first-find / finds-25                            */
/* ------------------------------------------------------------------ */

describe('computeAchievements — first-find / finds-25', () => {
  it('unlocks first-find at exactly 1 sighting', () => {
    expect(findAch(computeAchievements([], 0), 'first-find').unlocked).toBe(false);
    expect(findAch(computeAchievements([makeSighting()], 0), 'first-find').unlocked).toBe(true);
  });

  it('finds-25 stays locked at 24 and unlocks at 25 total captures', () => {
    const at24 = findAch(computeAchievements(distinctSightings(24), 0), 'finds-25');
    expect(at24.unlocked).toBe(false);
    expect(at24.progress.current).toBe(24);

    const at25 = findAch(computeAchievements(distinctSightings(25), 0), 'finds-25');
    expect(at25.unlocked).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Species thresholds (unique species, not total finds)                */
/* ------------------------------------------------------------------ */

describe('computeAchievements — species thresholds', () => {
  it('tracks UNIQUE species, not total finds', () => {
    // 10 unique species, each caught twice = 20 finds but 10 unique species.
    const unique = distinctSightings(10);
    const doubled = [...unique, ...unique.map((s, i) => ({ ...s, id: `dup-${i}` }))];

    const list = computeAchievements(doubled, 0);
    expect(findAch(list, 'species-10').unlocked).toBe(true);
    expect(findAch(list, 'species-25').unlocked).toBe(false);
    expect(findAch(list, 'species-25').progress.current).toBe(10);
  });

  it('species-50 unlocks at 50 unique species', () => {
    expect(findAch(computeAchievements(distinctSightings(50), 0), 'species-50').unlocked).toBe(true);
    expect(findAch(computeAchievements(distinctSightings(49), 0), 'species-50').unlocked).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* all-categories                                                       */
/* ------------------------------------------------------------------ */

describe('computeAchievements — all-categories', () => {
  const CORE: Category[] = ['animal', 'plant', 'tree', 'mushroom'];

  it('stays locked with only 3 of the 4 categories (progress 3/4)', () => {
    const sightings = CORE.slice(0, 3).map((category) => makeSighting({ category }));
    const a = findAch(computeAchievements(sightings, 0), 'all-categories');
    expect(a.unlocked).toBe(false);
    expect(a.progress).toEqual({ current: 3, target: 4 });
  });

  it('unlocks once animal + plant + tree + mushroom are all present', () => {
    const sightings = CORE.map((category) => makeSighting({ category }));
    expect(findAch(computeAchievements(sightings, 0), 'all-categories').unlocked).toBe(true);
  });

  it('"unknown" category sightings do not count toward the 4 core categories', () => {
    const sightings = [
      ...CORE.slice(0, 3).map((category) => makeSighting({ category })),
      makeSighting({ category: 'unknown' }),
    ];
    expect(findAch(computeAchievements(sightings, 0), 'all-categories').unlocked).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Rarity tiers: higher rarity satisfies lower "first-X" thresholds too */
/* ------------------------------------------------------------------ */

describe('computeAchievements — rarity tiers', () => {
  it('a common-only collection unlocks none of the rare/epic/legendary achievements', () => {
    const list = computeAchievements(distinctSightings(5, { rarity: 'common' }), 0);
    expect(findAch(list, 'first-rare').unlocked).toBe(false);
    expect(findAch(list, 'first-epic').unlocked).toBe(false);
    expect(findAch(list, 'first-legendary').unlocked).toBe(false);
  });

  it('a rare find unlocks first-rare only', () => {
    const list = computeAchievements([makeSighting({ rarity: 'rare' })], 0);
    expect(findAch(list, 'first-rare').unlocked).toBe(true);
    expect(findAch(list, 'first-epic').unlocked).toBe(false);
    expect(findAch(list, 'first-legendary').unlocked).toBe(false);
  });

  it('a legendary find unlocks first-rare, first-epic AND first-legendary', () => {
    const list = computeAchievements([makeSighting({ rarity: 'legendary' })], 0);
    expect(findAch(list, 'first-rare').unlocked).toBe(true);
    expect(findAch(list, 'first-epic').unlocked).toBe(true);
    expect(findAch(list, 'first-legendary').unlocked).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* streak-7                                                             */
/* ------------------------------------------------------------------ */

describe('computeAchievements — streak-7', () => {
  it('stays locked below 7 and unlocks at 7', () => {
    const at6 = findAch(computeAchievements([], 6), 'streak-7');
    expect(at6.unlocked).toBe(false);
    expect(at6.progress).toEqual({ current: 6, target: 7 });

    expect(findAch(computeAchievements([], 7), 'streak-7').unlocked).toBe(true);
  });

  it('caps progress.current at the target for a longer streak', () => {
    const a = findAch(computeAchievements([], 30), 'streak-7');
    expect(a.unlocked).toBe(true);
    expect(a.progress).toEqual({ current: 7, target: 7 });
  });
});

/* ------------------------------------------------------------------ */
/* today-3                                                              */
/* ------------------------------------------------------------------ */

describe('computeAchievements — today-3', () => {
  it('only counts sightings from the last 24h', () => {
    const now = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString();

    const sightings = [
      makeSighting({ createdAt: now }),
      makeSighting({ createdAt: now }),
      makeSighting({ createdAt: twoDaysAgo }),
    ];
    const a = findAch(computeAchievements(sightings, 0), 'today-3');
    expect(a.unlocked).toBe(false);
    expect(a.progress.current).toBe(2);
  });

  it('unlocks with 3 sightings today', () => {
    const now = new Date().toISOString();
    const sightings = [
      makeSighting({ createdAt: now }),
      makeSighting({ createdAt: now }),
      makeSighting({ createdAt: now }),
    ];
    expect(findAch(computeAchievements(sightings, 0), 'today-3').unlocked).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* wild-explorer                                                        */
/* ------------------------------------------------------------------ */

describe('computeAchievements — wild-explorer', () => {
  it('only counts captiveStatus === "wild"', () => {
    const sightings = [
      ...distinctSightings(5, { captiveStatus: 'wild' }),
      makeSighting({ captiveStatus: 'domestic' }),
      makeSighting({ captiveStatus: 'zoo_captive' }),
    ];
    const a = findAch(computeAchievements(sightings, 0), 'wild-explorer');
    expect(a.unlocked).toBe(false);
    expect(a.progress.current).toBe(5);
  });

  it('unlocks at 10 wild sightings', () => {
    const list = computeAchievements(distinctSightings(10, { captiveStatus: 'wild' }), 0);
    expect(findAch(list, 'wild-explorer').unlocked).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Solo Lab sample achievements: first-sample / field-researcher /     */
/* lab-patron — driven by the optional 3rd `sampleCount` argument only  */
/* ------------------------------------------------------------------ */

describe('computeAchievements — Solo Lab sample achievements', () => {
  it('defaults sampleCount to 0 when the 3rd argument is omitted (all three locked)', () => {
    const list = computeAchievements([], 0);
    expect(findAch(list, 'first-sample').unlocked).toBe(false);
    expect(findAch(list, 'field-researcher').unlocked).toBe(false);
    expect(findAch(list, 'lab-patron').unlocked).toBe(false);
  });

  it('first-sample unlocks at exactly 1 filed sample', () => {
    expect(findAch(computeAchievements([], 0, 0), 'first-sample').unlocked).toBe(false);
    expect(findAch(computeAchievements([], 0, 1), 'first-sample').unlocked).toBe(true);
  });

  it('field-researcher stays locked at 4 and unlocks at 5', () => {
    const at4 = findAch(computeAchievements([], 0, 4), 'field-researcher');
    expect(at4.unlocked).toBe(false);
    expect(at4.progress.current).toBe(4);
    expect(findAch(computeAchievements([], 0, 5), 'field-researcher').unlocked).toBe(true);
  });

  it('lab-patron unlocks at 15 and caps progress.current at 15 beyond that', () => {
    expect(findAch(computeAchievements([], 0, 14), 'lab-patron').unlocked).toBe(false);
    const at20 = findAch(computeAchievements([], 0, 20), 'lab-patron');
    expect(at20.unlocked).toBe(true);
    expect(at20.progress).toEqual({ current: 15, target: 15 });
  });

  it('sampleCount does NOT affect any of the other (sighting/streak-based) achievements', () => {
    const withoutSamples = computeAchievements([], 0, 0);
    const withSamples = computeAchievements([], 0, 20);
    const otherIds = withoutSamples
      .map((a) => a.id)
      .filter((id) => !['first-sample', 'field-researcher', 'lab-patron'].includes(id));
    for (const id of otherIds) {
      expect(findAch(withSamples, id)).toEqual(findAch(withoutSamples, id));
    }
  });
});
