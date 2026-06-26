/**
 * Local persistence for LifeDex — user captures survive an app restart.
 *
 * Scope decision: we persist ONLY the user's own captures, not the seeded demo
 * baseline. The seed is static content that should always reflect the current
 * code (and stay consistent across reinstalls); freezing it into storage would
 * make future seed changes invisible. So on startup the store loads the seed
 * fresh and merges the persisted captures on top (see useLifeDexStore.hydrate).
 *
 * Storage is AsyncStorage (device-local, no network). The original private photo
 * URI lives only in the on-device record and never leaves the device — storing
 * it locally is not a privacy regression. This is a stepping stone before
 * Supabase; the same captures will later sync to the backend.
 *
 * All reads/writes are best-effort and never throw: a storage failure must not
 * crash the app or block a capture.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Sighting } from '@/domain/types';
// Type-only import — erased at runtime, so no circular dependency with the store.
import type { CollectionCard } from './useLifeDexStore';

/** One persisted capture: the sighting plus its 1:1 collection card. */
export interface PersistedCapture {
  sighting: Sighting;
  card: CollectionCard;
}

/** Versioned key so a future schema change can invalidate old data cleanly. */
const STORAGE_KEY = 'lifedex:captures:v1';

/** Shallow guard against corrupt / partial entries. */
function isValidCapture(x: unknown): x is PersistedCapture {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as Partial<PersistedCapture>;
  return (
    typeof c.sighting?.id === 'string' &&
    typeof c.card?.id === 'string' &&
    typeof c.sighting?.xp === 'number'
  );
}

/** Load persisted user captures. Returns [] on any error or missing/corrupt data. */
export async function loadUserCaptures(): Promise<PersistedCapture[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCapture);
  } catch {
    return [];
  }
}

/** Persist the full user-captures list (best-effort; never throws). */
export async function saveUserCaptures(list: PersistedCapture[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Best-effort: a write failure must not break the capture flow.
  }
}

/** Remove all persisted captures (factory reset; best-effort). */
export async function clearUserCaptures(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
