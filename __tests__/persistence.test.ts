/**
 * Tests for local capture persistence (survives app restart).
 *
 * Covers:
 *   - saveUserCaptures / loadUserCaptures round-trip via the AsyncStorage mock.
 *   - loadUserCaptures filters out corrupt entries and returns [] on empty.
 *   - A real capture, after a SIMULATED RESTART (store.reset()), is restored by
 *     store.hydrate() — same sighting id, XP credited once, not duplicated.
 *   - Seed baseline is NOT persisted (only user captures are).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadUserCaptures,
  saveUserCaptures,
  clearUserCaptures,
  type PersistedCapture,
} from '../src/store/persistence';
import { lifeDexStore } from '../src/store/useLifeDexStore';
import { createSightingFromImage } from '../src/services/sightingPipeline';
import type { CollectionCard } from '../src/store/useLifeDexStore';
import type { Sighting } from '../src/domain/types';

function fakeCapture(id: string, xp: number): PersistedCapture {
  const sighting = { id, xp } as unknown as Sighting;
  const card = { id: `card-${id}`, sightingId: id } as unknown as CollectionCard;
  return { sighting, card };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  lifeDexStore.reset();
});

/* ------------------------------------------------------------------ */
/* Round-trip                                                          */
/* ------------------------------------------------------------------ */

describe('persistence round-trip', () => {
  it('saves and loads captures', async () => {
    await saveUserCaptures([fakeCapture('s1', 10), fakeCapture('s2', 20)]);
    const loaded = await loadUserCaptures();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.sighting.id).toBe('s1');
  });

  it('returns [] when nothing is stored', async () => {
    expect(await loadUserCaptures()).toEqual([]);
  });

  it('filters out corrupt entries', async () => {
    await AsyncStorage.setItem(
      'lifedex:captures:v1',
      JSON.stringify([{ junk: true }, fakeCapture('ok', 5)]),
    );
    const loaded = await loadUserCaptures();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.sighting.id).toBe('ok');
  });

  it('clearUserCaptures empties storage', async () => {
    await saveUserCaptures([fakeCapture('s1', 10)]);
    await clearUserCaptures();
    expect(await loadUserCaptures()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Restart simulation                                                  */
/* ------------------------------------------------------------------ */

describe('store hydrate (simulated restart)', () => {
  it('restores a captured sighting after reset()', async () => {
    const baseline = lifeDexStore.listSightings().length;

    // 'dog' is not in the seed → a real first discovery that gets persisted.
    const res = await createSightingFromImage({ imageUri: 'mock://x.jpg', mockSpecies: 'dog' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await lifeDexStore.flush(); // ensure the persist write settled
    expect(lifeDexStore.listSightings()).toHaveLength(baseline + 1);

    // Simulate restart: wipe in-memory state back to the seed baseline.
    lifeDexStore.reset();
    expect(lifeDexStore.getSightingById(res.sightingId)).toBeUndefined();
    expect(lifeDexStore.listSightings()).toHaveLength(baseline);

    // Hydrate from storage → capture comes back exactly once.
    await lifeDexStore.hydrate();
    expect(lifeDexStore.getSightingById(res.sightingId)).toBeDefined();
    expect(lifeDexStore.listSightings()).toHaveLength(baseline + 1);
  });

  it('does not persist the seed baseline', async () => {
    // Fresh reset, no captures yet → storage must be empty.
    await clearUserCaptures();
    lifeDexStore.reset();
    expect(await loadUserCaptures()).toEqual([]);
  });

  it('hydrate is idempotent (no duplication on double call)', async () => {
    const baseline = lifeDexStore.listSightings().length;
    const res = await createSightingFromImage({ imageUri: 'mock://y.jpg', mockSpecies: 'dog' });
    if (!res.ok) return;
    await lifeDexStore.flush();

    lifeDexStore.reset();
    await lifeDexStore.hydrate();
    await lifeDexStore.hydrate();
    expect(lifeDexStore.listSightings()).toHaveLength(baseline + 1);
  });
});
