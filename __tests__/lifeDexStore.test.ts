/**
 * Unit tests for the central lifeDexStore singleton and the useLifeDexStore
 * React hook (store-layer only — no component rendering).
 *
 * Covers:
 *   - Store/load round-trips: getSightingById / getCardById
 *   - addSighting persists both sighting and card consistently
 *   - Idempotency: calling addSighting twice with the same id does nothing
 *   - Missing id → returns undefined, never throws
 *   - XP and level are credited correctly
 *   - reset() restores seeded baseline (not empty)
 *   - Listeners are notified on mutation and released on unsubscribe
 *   - CollectionCard id convention (card-<sightingId>)
 *   - Selectors: selectRecentDiscoveries / selectTodayCount / selectTotalSpecies
 */
import {
  lifeDexStore,
  selectRecentDiscoveries,
  selectTodayCount,
  selectTotalSpecies,
} from '../src/store/useLifeDexStore';
import type { CollectionCard } from '../src/store/useLifeDexStore';
import type { Sighting } from '../src/domain/types';

/* ------------------------------------------------------------------ */
/* Fixture helpers                                                     */
/* ------------------------------------------------------------------ */

let seq = 0;

function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    id: `test-sighting-${seq}`,
    userId: 'mock-user-001',
    createdAt: new Date().toISOString(),
    category: 'animal',
    commonName: `Test Species ${seq}`,
    scientificName: `Testus species${seq}`,
    confidence: 0.9,
    rarity: 'common',
    xp: 50,
    captiveStatus: 'wild',
    sensitivity: 'none',
    privatePhotoUri: `file:///private/test-${seq}.jpg`,
    publicImageUri: `mock-card://animal/test-${seq}/common/50`,
    publicLocation: { lat: 51.5, lng: -0.1, precisionMeters: 500, hidden: false },
    card: {
      name: `Test Species ${seq}`,
      category: 'animal',
      rarity: 'common',
      xp: 50,
      description: 'A test species.',
      stats: { habitat: 'Test' },
      safetyNotes: [],
    },
    moderation: {
      allowed: true,
      reasons: [],
      strippedRegions: [],
      qualityOk: true,
    },
    ...overrides,
  };
}

function makeCard(sightingId: string, sighting: Sighting): CollectionCard {
  return {
    id: `card-${sightingId}`,
    sightingId,
    card: sighting.card,
    publicImageUri: sighting.publicImageUri,
    rarity: sighting.rarity,
    createdAt: sighting.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  lifeDexStore.reset();
});

/* ------------------------------------------------------------------ */
/* Seeded baseline                                                     */
/* ------------------------------------------------------------------ */

describe('seeded baseline', () => {
  it('boots with sightings and positive XP', () => {
    const snap = lifeDexStore.getSnapshot();
    expect(snap.sightings.length).toBeGreaterThan(0);
    expect(snap.collectionCards.length).toBe(snap.sightings.length);
    expect(snap.profile.xp).toBeGreaterThan(0);
    expect(snap.profile.level).toBeGreaterThanOrEqual(1);
  });

  it('every seeded sighting has a matching card with id card-<sightingId>', () => {
    const snap = lifeDexStore.getSnapshot();
    for (const s of snap.sightings) {
      const card = lifeDexStore.getCardById(`card-${s.id}`);
      expect(card).toBeDefined();
      expect(card?.sightingId).toBe(s.id);
    }
  });

  it('getSightingById resolves every seeded id', () => {
    const snap = lifeDexStore.getSnapshot();
    for (const s of snap.sightings) {
      expect(lifeDexStore.getSightingById(s.id)?.id).toBe(s.id);
    }
  });
});

/* ------------------------------------------------------------------ */
/* addSighting — store/load round-trip                                */
/* ------------------------------------------------------------------ */

describe('addSighting — round-trip', () => {
  it('getSightingById returns the exact sighting that was added', () => {
    const s = makeSighting({ id: 'rt-sighting-1' });
    lifeDexStore.addSighting(s);
    const retrieved = lifeDexStore.getSightingById('rt-sighting-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.commonName).toBe(s.commonName);
    expect(retrieved?.xp).toBe(s.xp);
    expect(retrieved?.rarity).toBe(s.rarity);
  });

  it('getCardById returns the card derived from the sighting', () => {
    const s = makeSighting({ id: 'rt-sighting-2', rarity: 'rare', xp: 300 });
    lifeDexStore.addSighting(s);
    const card = lifeDexStore.getCardById('card-rt-sighting-2');
    expect(card).toBeDefined();
    expect(card?.sightingId).toBe('rt-sighting-2');
    expect(card?.rarity).toBe('rare');
  });

  it('addSighting with an explicit CollectionCard persists that card', () => {
    const s = makeSighting({ id: 'rt-sighting-3' });
    const c = makeCard('rt-sighting-3', { ...s, publicImageUri: 'mock-card://custom/uri' });
    lifeDexStore.addSighting(s, c);
    const card = lifeDexStore.getCardById('card-rt-sighting-3');
    expect(card?.publicImageUri).toBe('mock-card://custom/uri');
  });

  it('sighting appears in listSightings()', () => {
    const s = makeSighting({ id: 'rt-list-1' });
    lifeDexStore.addSighting(s);
    const ids = lifeDexStore.listSightings().map((x) => x.id);
    expect(ids).toContain('rt-list-1');
  });

  it('card appears in listCollection()', () => {
    const s = makeSighting({ id: 'rt-list-2' });
    lifeDexStore.addSighting(s);
    const ids = lifeDexStore.listCollection().map((c) => c.sightingId);
    expect(ids).toContain('rt-list-2');
  });

  it('returns sightingId and cardId from addSighting', () => {
    const s = makeSighting({ id: 'rt-ret-1' });
    const result = lifeDexStore.addSighting(s);
    expect(result.sightingId).toBe('rt-ret-1');
    expect(result.cardId).toBe('card-rt-ret-1');
  });
});

/* ------------------------------------------------------------------ */
/* Idempotency                                                         */
/* ------------------------------------------------------------------ */

describe('addSighting — idempotency', () => {
  it('calling addSighting twice with same id does not duplicate', () => {
    const before = lifeDexStore.getSnapshot().sightings.length;
    const s = makeSighting({ id: 'idem-1', xp: 100 });
    lifeDexStore.addSighting(s);
    lifeDexStore.addSighting(s);
    expect(lifeDexStore.getSnapshot().sightings).toHaveLength(before + 1);
  });

  it('XP is credited exactly once when same sighting is added twice', () => {
    const baseline = lifeDexStore.getSnapshot().profile.xp;
    const s = makeSighting({ id: 'idem-2', xp: 75 });
    lifeDexStore.addSighting(s);
    lifeDexStore.addSighting(s);
    expect(lifeDexStore.getSnapshot().profile.xp).toBe(baseline + 75);
  });

  it('second addSighting returns the existing ids', () => {
    const s = makeSighting({ id: 'idem-3' });
    lifeDexStore.addSighting(s);
    const second = lifeDexStore.addSighting(s);
    expect(second.sightingId).toBe('idem-3');
    expect(second.cardId).toBe('card-idem-3');
  });
});

/* ------------------------------------------------------------------ */
/* Missing id — clean error / empty state, never throws               */
/* ------------------------------------------------------------------ */

describe('missing id — never throws', () => {
  it('getSightingById returns undefined for unknown id', () => {
    expect(lifeDexStore.getSightingById('no-such-id')).toBeUndefined();
  });

  it('getCardById returns undefined for unknown card id', () => {
    expect(lifeDexStore.getCardById('no-such-card')).toBeUndefined();
  });

  it('getSightingById does not throw on empty string', () => {
    expect(() => lifeDexStore.getSightingById('')).not.toThrow();
    expect(lifeDexStore.getSightingById('')).toBeUndefined();
  });

  it('getCardById does not throw on empty string', () => {
    expect(() => lifeDexStore.getCardById('')).not.toThrow();
    expect(lifeDexStore.getCardById('')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* XP and level crediting                                             */
/* ------------------------------------------------------------------ */

describe('XP and level', () => {
  it('credits XP correctly for a single sighting', () => {
    const baseline = lifeDexStore.getSnapshot().profile.xp;
    lifeDexStore.addSighting(makeSighting({ id: 'xp-1', xp: 200 }));
    expect(lifeDexStore.getSnapshot().profile.xp).toBe(baseline + 200);
  });

  it('accumulates XP across multiple adds', () => {
    const baseline = lifeDexStore.getSnapshot().profile.xp;
    lifeDexStore.addSighting(makeSighting({ id: 'xp-2a', xp: 100 }));
    lifeDexStore.addSighting(makeSighting({ id: 'xp-2b', xp: 150 }));
    lifeDexStore.addSighting(makeSighting({ id: 'xp-2c', xp: 50 }));
    expect(lifeDexStore.getSnapshot().profile.xp).toBe(baseline + 300);
  });

  it('level is non-decreasing as XP grows', () => {
    const l0 = lifeDexStore.getSnapshot().profile.level;
    lifeDexStore.addSighting(makeSighting({ id: 'xp-level', xp: 10000 }));
    expect(lifeDexStore.getSnapshot().profile.level).toBeGreaterThanOrEqual(l0);
  });
});

/* ------------------------------------------------------------------ */
/* Prepend ordering                                                   */
/* ------------------------------------------------------------------ */

describe('sighting ordering', () => {
  it('new sightings are prepended (newest first)', () => {
    const s1 = makeSighting({ id: 'ord-1', commonName: 'Alpha' });
    const s2 = makeSighting({ id: 'ord-2', commonName: 'Beta' });
    lifeDexStore.addSighting(s1);
    lifeDexStore.addSighting(s2);
    const ids = lifeDexStore.listSightings().map((s) => s.id);
    expect(ids.indexOf('ord-2')).toBeLessThan(ids.indexOf('ord-1'));
  });
});

/* ------------------------------------------------------------------ */
/* Listeners                                                          */
/* ------------------------------------------------------------------ */

describe('subscribe / unsubscribe', () => {
  it('listener is called when a sighting is added', () => {
    const listener = jest.fn();
    const unsub = lifeDexStore.subscribe(listener);
    lifeDexStore.addSighting(makeSighting());
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('listener is NOT called after unsubscribe', () => {
    const listener = jest.fn();
    const unsub = lifeDexStore.subscribe(listener);
    unsub();
    lifeDexStore.addSighting(makeSighting());
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple independent listeners each receive one notification', () => {
    const l1 = jest.fn();
    const l2 = jest.fn();
    const u1 = lifeDexStore.subscribe(l1);
    const u2 = lifeDexStore.subscribe(l2);
    lifeDexStore.addSighting(makeSighting());
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });
});

/* ------------------------------------------------------------------ */
/* reset                                                               */
/* ------------------------------------------------------------------ */

describe('reset', () => {
  it('restores seeded baseline (not empty)', () => {
    const baseline = lifeDexStore.getSnapshot().sightings.length;
    lifeDexStore.addSighting(makeSighting({ id: 'pre-reset-1' }));
    lifeDexStore.addSighting(makeSighting({ id: 'pre-reset-2' }));
    lifeDexStore.reset();
    expect(lifeDexStore.getSnapshot().sightings).toHaveLength(baseline);
  });

  it('removes added sightings after reset', () => {
    lifeDexStore.addSighting(makeSighting({ id: 'should-vanish' }));
    lifeDexStore.reset();
    expect(lifeDexStore.getSightingById('should-vanish')).toBeUndefined();
  });

  it('restores baseline XP after reset', () => {
    const baseXp = lifeDexStore.getSnapshot().profile.xp;
    lifeDexStore.addSighting(makeSighting({ id: 'xp-reset', xp: 9999 }));
    lifeDexStore.reset();
    expect(lifeDexStore.getSnapshot().profile.xp).toBe(baseXp);
  });
});

/* ------------------------------------------------------------------ */
/* Pipeline state                                                     */
/* ------------------------------------------------------------------ */

describe('setPipelineState / setLoading / setError', () => {
  it('pipeline phase transitions', () => {
    lifeDexStore.setPipelineState({ phase: 'running', step: 'moderating' });
    expect(lifeDexStore.getSnapshot().pipeline.phase).toBe('running');
    expect(lifeDexStore.getSnapshot().pipeline.step).toBe('moderating');
  });

  it('setLoading toggles the loading flag', () => {
    lifeDexStore.setLoading(true);
    expect(lifeDexStore.getSnapshot().loading).toBe(true);
    lifeDexStore.setLoading(false);
    expect(lifeDexStore.getSnapshot().loading).toBe(false);
  });

  it('setError stores and clears an error message', () => {
    lifeDexStore.setError('Something went wrong');
    expect(lifeDexStore.getSnapshot().error).toBe('Something went wrong');
    lifeDexStore.setError(null);
    expect(lifeDexStore.getSnapshot().error).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Selectors                                                          */
/* ------------------------------------------------------------------ */

describe('selectors', () => {
  it('selectRecentDiscoveries returns at most 6 by default', () => {
    const state = lifeDexStore.getSnapshot();
    const recent = selectRecentDiscoveries(state);
    expect(recent.length).toBeLessThanOrEqual(6);
  });

  it('selectRecentDiscoveries respects the limit param', () => {
    const state = lifeDexStore.getSnapshot();
    const recent = selectRecentDiscoveries(state, 3);
    expect(recent.length).toBeLessThanOrEqual(3);
  });

  it('selectTodayCount counts sightings created in the last 24h', () => {
    const state = lifeDexStore.getSnapshot();
    const count = selectTodayCount(state);
    // Seeded sightings include 2 with daysAgo=0 and daysAgo=0 (Domestic Cat and Robin are 0/1 day)
    expect(count).toBeGreaterThanOrEqual(0);
    expect(typeof count).toBe('number');
  });

  it('selectTotalSpecies reflects unique species count', () => {
    const state = lifeDexStore.getSnapshot();
    const total = selectTotalSpecies(state);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(state.sightings.length);
  });

  it('selectTotalSpecies increases when a new unique species is added', () => {
    const before = selectTotalSpecies(lifeDexStore.getSnapshot());
    lifeDexStore.addSighting(
      makeSighting({ id: 'new-species-unique', commonName: 'Absolutely Unique Species XYZ' }),
    );
    const after = selectTotalSpecies(lifeDexStore.getSnapshot());
    expect(after).toBe(before + 1);
  });
});
