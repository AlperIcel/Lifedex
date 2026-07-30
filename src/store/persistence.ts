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

/**
 * Mirrors src/store/lab.ts's own STORAGE_KEY constant — duplicated (not
 * imported) to avoid a persistence.ts -> lab.ts -> useLifeDexStore.ts ->
 * persistence.ts import cycle (useLifeDexStore.ts already imports this file).
 * Keep both literals in sync.
 */
const LAB_STORAGE_KEY = 'lifedex:lab:v1';

/** Remove all persisted captures (factory reset; best-effort). */
export async function clearUserCaptures(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(STREAK_KEY);
    await AsyncStorage.removeItem(DAILY_REWARD_KEY);
    await AsyncStorage.removeItem(LAB_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Daily streak meta                                                   */
/* ------------------------------------------------------------------ */

export interface StreakMeta {
  /** ISO time of the last NEW-species capture, or null. */
  lastCaptureISO: string | null;
  /** Current consecutive-day streak. */
  streak: number;
}

const STREAK_KEY = 'lifedex:streak:v1';

export async function loadStreakMeta(): Promise<StreakMeta> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (raw === null) return { lastCaptureISO: null, streak: 0 };
    const p = JSON.parse(raw) as Partial<StreakMeta>;
    if (typeof p.streak === 'number') {
      return {
        lastCaptureISO: typeof p.lastCaptureISO === 'string' ? p.lastCaptureISO : null,
        streak: p.streak,
      };
    }
    return { lastCaptureISO: null, streak: 0 };
  } catch {
    return { lastCaptureISO: null, streak: 0 };
  }
}

export async function saveStreakMeta(meta: StreakMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(meta));
  } catch {
    // best-effort
  }
}

/* ------------------------------------------------------------------ */
/* Daily reward (daily-quest claim) meta                               */
/* ------------------------------------------------------------------ */

/**
 * Tracks which calendar day's daily-quest reward has been claimed, so
 * `claimDailyReward` (useLifeDexStore.ts) can allow at most one claim per
 * dayKey. Minimal by design: the quests themselves are recomputed live from
 * `sightings` (src/domain/dailyQuests.ts) — only the claim itself needs to
 * survive a restart.
 */
export interface DailyRewardMeta {
  /** dayKey ('YYYY-MM-DD') of the last claimed daily reward, or null if never claimed. */
  lastClaimedDayKey: string | null;
}

const DAILY_REWARD_KEY = 'lifedex:dailyReward:v1';

export async function loadDailyRewardMeta(): Promise<DailyRewardMeta> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_REWARD_KEY);
    if (raw === null) return { lastClaimedDayKey: null };
    const p = JSON.parse(raw) as Partial<DailyRewardMeta>;
    return {
      lastClaimedDayKey: typeof p.lastClaimedDayKey === 'string' ? p.lastClaimedDayKey : null,
    };
  } catch {
    return { lastClaimedDayKey: null };
  }
}

export async function saveDailyRewardMeta(meta: DailyRewardMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_REWARD_KEY, JSON.stringify(meta));
  } catch {
    // best-effort
  }
}
