/**
 * settings — small reactive singleton for user-configurable app preferences
 * (distance units, haptics, sound). Deliberately kept SEPARATE from
 * useLifeDexStore (profile/sightings/collection/leaderboard): these are two
 * independent concerns, and splitting them means settings work never touches
 * the same file as gameplay-state work (see CLAUDE.md "Delegating to
 * subagents" — never run two agents on the same file).
 *
 * Pattern mirrors useLifeDexStore.ts: a class-based singleton exposing
 * `subscribe`/`getSnapshot` for React's useSyncExternalStore, no external
 * state library. Persistence mirrors src/store/persistence.ts: a single
 * versioned AsyncStorage key, best-effort reads/writes that never throw —
 * a storage failure must never crash the app or block a setting change.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type DistanceUnits = 'km' | 'mi';

export interface SettingsState {
  /** Preferred distance unit for maps/distance displays. */
  units: DistanceUnits;
  /** Master haptics switch — src/utils/haptics.ts checks this before every call. */
  hapticsEnabled: boolean;
  /**
   * Sound/music master switch. Reserved for when an audio engine ships — the
   * app currently has no sound assets or player, so no code path reads this
   * yet. The Settings screen renders this as "coming soon" rather than
   * offering a toggle that would silently do nothing.
   */
  soundEnabled: boolean;
  /** True once an AsyncStorage read (or its absence) has been resolved. */
  hydrated: boolean;
}

/** Shape actually persisted — excludes the runtime-only `hydrated` flag. */
type PersistedSettings = Omit<SettingsState, 'hydrated'>;

/** Versioned key so a future schema change can invalidate old data cleanly. */
const STORAGE_KEY = 'lifedex:settings:v1';

const DEFAULTS: SettingsState = {
  units: 'km',
  hapticsEnabled: true,
  soundEnabled: true,
  hydrated: false,
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isDistanceUnits(x: unknown): x is DistanceUnits {
  return x === 'km' || x === 'mi';
}

/** Shallow guard against corrupt / partial / future-schema storage payloads. */
function sanitize(raw: unknown): Partial<PersistedSettings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PersistedSettings> = {};
  if (isDistanceUnits(r.units)) out.units = r.units;
  if (typeof r.hapticsEnabled === 'boolean') out.hapticsEnabled = r.hapticsEnabled;
  if (typeof r.soundEnabled === 'boolean') out.soundEnabled = r.soundEnabled;
  return out;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type Listener = () => void;

class SettingsStore {
  private state: SettingsState = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  /** Tracks the latest persist write so tests/callers can await it via flush(). */
  private persistPromise: Promise<void> = Promise.resolve();
  /** Guards against overlapping/duplicate hydrate() calls (e.g. StrictMode double-effect). */
  private hydratePromise: Promise<void> | null = null;

  getSnapshot = (): SettingsState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  private setState(next: SettingsState): void {
    this.state = next;
    this.emit();
    this.persistPromise = this.persist();
  }

  private async persist(): Promise<void> {
    try {
      const { hydrated: _hydrated, ...persisted } = this.state;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Best-effort: a write failure must not break the setting change.
    }
  }

  /**
   * Load the persisted settings (if any) and merge them over the defaults.
   * Safe to call multiple times — concurrent calls share one in-flight read,
   * and a corrupt/missing payload just leaves the current (default) values.
   */
  hydrate(): Promise<void> {
    if (this.hydratePromise === null) {
      this.hydratePromise = this.doHydrate();
    }
    return this.hydratePromise;
  }

  private async doHydrate(): Promise<void> {
    let patch: Partial<PersistedSettings> = {};
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        patch = sanitize(JSON.parse(raw));
      }
    } catch {
      // Corrupt storage — fall back to whatever defaults/current state we have.
    }
    this.state = { ...this.state, ...patch, hydrated: true };
    this.emit();
  }

  setUnits(units: DistanceUnits): void {
    if (this.state.units === units) return;
    this.setState({ ...this.state, units });
  }

  setHapticsEnabled(enabled: boolean): void {
    if (this.state.hapticsEnabled === enabled) return;
    this.setState({ ...this.state, hapticsEnabled: enabled });
  }

  setSoundEnabled(enabled: boolean): void {
    if (this.state.soundEnabled === enabled) return;
    this.setState({ ...this.state, soundEnabled: enabled });
  }

  /** Resolves once the most recent persist write has settled (for tests). */
  flush(): Promise<void> {
    return this.persistPromise;
  }

  /**
   * Synchronous read for non-React callers (e.g. haptics.ts, which cannot use
   * hooks). Always returns the latest in-memory state.
   */
  getState(): SettingsState {
    return this.state;
  }

  /** Test-only: restore in-memory defaults and clear any hydrate lock. Does not touch storage. */
  resetForTests(): void {
    this.state = { ...DEFAULTS };
    this.hydratePromise = null;
    this.persistPromise = Promise.resolve();
    this.emit();
  }
}

export const settingsStore = new SettingsStore();

// Kick off hydration as soon as this module is first imported (typically very
// early — haptics.ts, which almost every screen touches, imports this module).
// Fire-and-forget: getState() returns safe defaults until this resolves, so
// no caller needs to await it.
void settingsStore.hydrate();

/* ------------------------------------------------------------------ */
/* React hook                                                          */
/* ------------------------------------------------------------------ */

/** Subscribe a component to the settings store. */
export function useSettings(): SettingsState {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot, // SSR / server snapshot
  );
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const METERS_PER_MILE = 1609.344;

/**
 * Format a distance in meters per a distance-unit preference. Pure and
 * side-effect-free so it is trivial to unit test and to reuse from any future
 * screen that renders a distance (maps, "near you" hints, etc.).
 */
export function formatDistance(meters: number, units: DistanceUnits): string {
  const safeMeters = Number.isFinite(meters) && meters > 0 ? meters : 0;

  if (units === 'mi') {
    const miles = safeMeters / METERS_PER_MILE;
    if (miles < 0.1) return `${Math.round(safeMeters * 3.28084)} ft`;
    return `${miles.toFixed(1)} mi`;
  }

  if (safeMeters < 1000) return `${Math.round(safeMeters)} m`;
  return `${(safeMeters / 1000).toFixed(1)} km`;
}
