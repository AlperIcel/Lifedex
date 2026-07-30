/**
 * lab — reactive singleton for the Solo Lab (research points, sample vials,
 * gadgets, filed samples). Deliberately kept SEPARATE from useLifeDexStore
 * (profile/sightings/collection): two independent concerns, so Solo Lab work
 * never touches the same file as core gameplay-state work (see CLAUDE.md
 * "Delegating to subagents" — never run two agents on the same file).
 *
 * Pattern mirrors src/store/settings.ts: a class-based singleton exposing
 * `subscribe`/`getSnapshot` for React's useSyncExternalStore, a single
 * versioned AsyncStorage key, best-effort reads/writes that never throw, a
 * single-flight `hydrate()`, and a `flush()` tests can await.
 *
 * Every mutating action is GATED IN THE STORE ITSELF (via the pure gate
 * functions in src/domain/lab.ts) so the core invariants hold even if a caller
 * bypasses a disabled button — same defensive stance as
 * useLifeDexStore.ts's `claimDailyReward`.
 *
 * Zero network I/O. No community feature reads/writes anything here.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { computeAchievements } from '@/domain/achievements';
import {
  LAB_TUNING,
  buildSample,
  canBuyGadget,
  canSubmitSample,
  labFocusForWeek,
  rpForCatch,
  weekKeyOf,
  type GadgetId,
  type LabSample,
} from '@/domain/lab';
import { CategorySchema, RaritySchema, type Category, type Rarity, type Sighting } from '@/domain/types';
import { lifeDexStore } from './useLifeDexStore';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface LabState {
  researchPoints: number;
  vials: number;
  ownedGadgets: GadgetId[];
  samples: LabSample[];
  /** dayKey ('YYYY-MM-DD') of the last daily-claim vial grant, or undefined if never granted. */
  lastVialGrantDayKey?: string;
  /**
   * Ids (src/domain/achievements.ts) newly unlocked by `submitSample()` and
   * not yet shown to the UI. Mirrors useLifeDexStore.ts's
   * `pendingAchievements`/`consumeAchievements()` read-and-clear queue
   * pattern — LabScreen consumes it once on mount so a lab-achievement unlock
   * toast shows exactly once, independent of ResultScreen's own catch-driven
   * achievement/level-up sequencing (which this deliberately never touches).
   * Runtime-only — never persisted.
   */
  pendingAchievements: string[];
  /** True once an AsyncStorage read (or its absence) has been resolved. */
  hydrated: boolean;
}

/** Shape actually persisted — excludes the runtime-only `hydrated` flag and the transient achievement queue. */
type PersistedLabState = Omit<LabState, 'hydrated' | 'pendingAchievements'>;

/**
 * Versioned key so a future schema change can invalidate old data cleanly.
 * Exported ONLY as a literal comment target: src/store/persistence.ts's
 * `clearUserCaptures()` duplicates this exact string (not imported) to avoid
 * a persistence.ts -> lab.ts -> useLifeDexStore.ts -> persistence.ts import
 * cycle (useLifeDexStore.ts already imports persistence.ts). Keep both in sync.
 */
const STORAGE_KEY = 'lifedex:lab:v1';

const DEFAULTS: LabState = {
  researchPoints: 0,
  vials: LAB_TUNING.startingVials,
  ownedGadgets: [],
  samples: [],
  lastVialGrantDayKey: undefined,
  pendingAchievements: [],
  hydrated: false,
};

export interface SubmitSampleResult {
  ok: boolean;
  reason?: 'not-bonus' | 'already-sampled' | 'no-vials';
  rpEarned?: number;
  /** Lab-achievement ids (see src/domain/achievements.ts) newly unlocked by this submission. */
  newlyUnlockedAchievementIds?: string[];
}

export interface BuyResult {
  ok: boolean;
  reason?: 'level' | 'rp' | 'owned';
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isGadgetId(x: unknown): x is GadgetId {
  return x === 'labor-pass' || x === 'makro-linse';
}

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

/** Shallow guard against corrupt / partial sample entries. */
function isValidSample(x: unknown): x is LabSample {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  if (typeof s.sightingId !== 'string' || s.sightingId.length === 0) return false;
  if (typeof s.speciesKey !== 'string' || s.speciesKey.length === 0) return false;
  if (typeof s.commonName !== 'string' || s.commonName.length === 0) return false;
  if (s.scientificName !== undefined && typeof s.scientificName !== 'string') return false;
  if (!CategorySchema.safeParse(s.category).success) return false;
  if (!RaritySchema.safeParse(s.rarity).success) return false;
  if (s.observationsCount !== undefined && !isFiniteNonNegative(s.observationsCount)) return false;
  if (typeof s.submittedAt !== 'string' || s.submittedAt.length === 0) return false;
  return true;
}

/** Shallow guard against corrupt / partial / future-schema storage payloads. */
function sanitize(raw: unknown): Partial<PersistedLabState> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PersistedLabState> = {};

  if (isFiniteNonNegative(r.researchPoints)) out.researchPoints = r.researchPoints;
  if (isFiniteNonNegative(r.vials)) out.vials = r.vials;

  if (Array.isArray(r.ownedGadgets)) {
    const seen = new Set<GadgetId>();
    for (const g of r.ownedGadgets) {
      if (isGadgetId(g)) seen.add(g);
    }
    out.ownedGadgets = [...seen];
  }

  if (Array.isArray(r.samples)) {
    out.samples = r.samples.filter(isValidSample);
  }

  if (typeof r.lastVialGrantDayKey === 'string') {
    out.lastVialGrantDayKey = r.lastVialGrantDayKey;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type Listener = () => void;

class LabStore {
  private state: LabState = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  /** Tracks the latest persist write so tests/callers can await it via flush(). */
  private persistPromise: Promise<void> = Promise.resolve();
  /** Guards against overlapping/duplicate hydrate() calls (e.g. StrictMode double-effect). */
  private hydratePromise: Promise<void> | null = null;

  getSnapshot = (): LabState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  private setState(next: LabState): void {
    this.state = next;
    this.emit();
    this.persistPromise = this.persist();
  }

  private async persist(): Promise<void> {
    try {
      const { hydrated: _hydrated, pendingAchievements: _pendingAchievements, ...persisted } =
        this.state;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Best-effort: a write failure must not break a lab action.
    }
  }

  /**
   * Load the persisted lab state (if any) and merge it over the defaults.
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
    let patch: Partial<PersistedLabState> = {};
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

  /** Resolves once the most recent persist write has settled (for tests). */
  flush(): Promise<void> {
    return this.persistPromise;
  }

  /** Synchronous read for non-React callers (mirrors settingsStore.getState()). */
  getState(): LabState {
    return this.state;
  }

  /* ----------------------------- Actions ---------------------------- */

  ownsGadget(id: GadgetId): boolean {
    return this.state.ownedGadgets.includes(id);
  }

  /**
   * File `sighting` as a lab sample: consumes one vial, mints `submitRp`
   * research points, and files the specimen — all IMMEDIATELY, all gated by
   * `canSubmitSample`. Also returns any lab-achievement ids newly unlocked by
   * this submission (diffed on sample COUNT only — the three lab achievements
   * read nothing else, so an empty sightings/streak snapshot is enough to
   * isolate exactly them; see src/domain/achievements.ts).
   */
  submitSample(sighting: Sighting): SubmitSampleResult {
    const gate = canSubmitSample(sighting, this.state.samples, this.state.vials);
    if (!gate.ok) return { ok: false, reason: gate.reason };

    const countBefore = this.state.samples.length;
    const sample = buildSample(sighting, new Date().toISOString());
    const countAfter = countBefore + 1;

    const unlockedBefore = new Set(
      computeAchievements([], 0, countBefore)
        .filter((a) => a.unlocked)
        .map((a) => a.id),
    );
    const newlyUnlockedAchievementIds = computeAchievements([], 0, countAfter)
      .filter((a) => a.unlocked && !unlockedBefore.has(a.id))
      .map((a) => a.id);

    const rpEarned = LAB_TUNING.submitRp;
    this.setState({
      ...this.state,
      vials: this.state.vials - 1,
      researchPoints: this.state.researchPoints + rpEarned,
      samples: [sample, ...this.state.samples],
      pendingAchievements: [...this.state.pendingAchievements, ...newlyUnlockedAchievementIds],
    });

    return { ok: true, rpEarned, newlyUnlockedAchievementIds };
  }

  /**
   * Read-and-clear the pending lab-achievement queue. Returns the ids newly
   * unlocked since the last consume, or [] if none are pending. Call once
   * (e.g. on LabScreen mount) so the unlock toast shows each newly-earned
   * badge exactly once.
   */
  consumeAchievements(): string[] {
    if (this.state.pendingAchievements.length === 0) return [];
    const ids = this.state.pendingAchievements;
    this.setState({ ...this.state, pendingAchievements: [] });
    return ids;
  }

  /**
   * Research points for ONE non-duplicate catch (see src/domain/lab.ts's
   * `rpForCatch`). The focus multiplier applies ONLY when the player owns
   * 'labor-pass' AND `category` matches this week's research focus. Returns
   * the credited amount (fire-and-forget for callers that don't need it).
   */
  creditCatchRp(
    rarity: Rarity,
    isFirstDiscovery: boolean,
    category: Category,
    nowISO: string,
  ): number {
    const isFocusCategory =
      this.ownsGadget('labor-pass') && labFocusForWeek(weekKeyOf(nowISO)) === category;
    const rp = rpForCatch(rarity, isFirstDiscovery, isFocusCategory);
    if (rp > 0) {
      this.setState({ ...this.state, researchPoints: this.state.researchPoints + rp });
    }
    return rp;
  }

  buyVial(): BuyResult {
    if (this.state.researchPoints < LAB_TUNING.vialPriceRp) return { ok: false, reason: 'rp' };
    this.setState({
      ...this.state,
      researchPoints: this.state.researchPoints - LAB_TUNING.vialPriceRp,
      vials: this.state.vials + 1,
    });
    return { ok: true };
  }

  buyGadget(id: GadgetId): BuyResult {
    const level = lifeDexStore.getProfile().level;
    const gate = canBuyGadget(id, level, this.state.researchPoints, this.state.ownedGadgets);
    if (!gate.ok) return gate;
    this.setState({
      ...this.state,
      researchPoints: this.state.researchPoints - LAB_TUNING.gadgets[id].priceRp,
      ownedGadgets: [...this.state.ownedGadgets, id],
    });
    return { ok: true };
  }

  /** Idempotent per dayKey — a second call the same day is a no-op (returns false). */
  grantDailyVial(dayKey: string): boolean {
    if (this.state.lastVialGrantDayKey === dayKey) return false;
    this.setState({
      ...this.state,
      vials: this.state.vials + LAB_TUNING.dailyClaimVialBonus,
      lastVialGrantDayKey: dayKey,
    });
    return true;
  }

  /**
   * Restore in-memory defaults and clear the hydrate lock so a subsequent
   * `hydrate()` genuinely re-reads storage (a "simulated restart" — mirrors
   * lifeDexStore.reset()'s role in persistence tests). Does NOT touch storage
   * itself; pair with clearUserCaptures() for a full factory reset.
   */
  reset(): void {
    this.state = { ...DEFAULTS };
    this.hydratePromise = null;
    this.persistPromise = Promise.resolve();
    this.emit();
  }
}

export const labStore = new LabStore();

// Kick off hydration as soon as this module is first imported. Fire-and-forget:
// getState() returns safe defaults until this resolves, so no caller needs to
// await it (same convention as settingsStore).
void labStore.hydrate();

/* ------------------------------------------------------------------ */
/* React hook                                                          */
/* ------------------------------------------------------------------ */

/** Subscribe a component to the lab store. */
export function useLabStore(): LabState {
  return useSyncExternalStore(
    labStore.subscribe,
    labStore.getSnapshot,
    labStore.getSnapshot, // SSR / server snapshot
  );
}
