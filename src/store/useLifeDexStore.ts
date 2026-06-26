/**
 * useLifeDexStore — THE single source of truth for LifeDex live session state.
 *
 * Consolidates the previously fragmented stores/hooks (useGameStore,
 * sightingStore, useMockStore, useMockCollection, useSighting) into ONE
 * reactive singleton built on useSyncExternalStore — zero third-party state
 * deps, matching the existing project convention.
 *
 * State managed:
 *   - profile            current player (id/username/xp/level)
 *   - sightings          all Sighting rows this session (newest first)
 *   - collectionCards    CollectionCard rows (1:1 with sightings; the saved
 *                        collection view)
 *   - leaderboardEntries leaderboard rows (seeded from existing mock data)
 *   - pipeline           capture/upload pipeline state machine
 *   - loading / error    coarse async flags for screens
 *
 * Seeded from the EXISTING mock datasets — no new dataset is invented:
 *   - sightings/cards: derived via the real scoring engine from the same
 *     15-entry species table that powered useMockCollection.
 *   - leaderboard: the existing MOCK_LEADERBOARD array, unchanged.
 *
 * All domain types come from @/domain/types only.
 */
import { useSyncExternalStore } from 'react';

import { buildCardMetadata } from '@/domain/cardMetadata';
import { getPublicLocation } from '@/domain/locationPrivacy';
import { scoreSighting } from '@/domain/scoring';
import type {
  CardMetadata,
  Profile,
  Rarity,
  RecognitionResult,
  Sighting,
} from '@/domain/types';
import {
  MOCK_LEADERBOARD,
  MOCK_CURRENT_USER_ID,
  type LeaderboardEntry,
} from '@/screens/leaderboard/mockData';
import {
  loadUserCaptures,
  saveUserCaptures,
  type PersistedCapture,
} from './persistence';

/* ------------------------------------------------------------------ */
/* Public state types                                                  */
/* ------------------------------------------------------------------ */

/**
 * A saved collection entry. Holds the card face metadata plus a back-reference
 * to the originating Sighting so the collection view and the sighting row stay
 * in sync without duplicating data.
 */
export interface CollectionCard {
  /** Stable card id (1:1 with its sighting). */
  id: string;
  sightingId: string;
  card: CardMetadata;
  publicImageUri: string;
  rarity: Rarity;
  createdAt: string;
}

/** Capture / upload pipeline lifecycle. */
export type PipelinePhase = 'idle' | 'running' | 'done' | 'error';

export interface PipelineState {
  phase: PipelinePhase;
  /** Fine-grained step label for UI (e.g. 'moderating', 'scoring'). */
  step?: string;
  /** Populated when phase === 'error'. */
  message?: string;
  /** True when the last run was blocked by moderation (not a hard error). */
  blocked?: boolean;
}

export interface LifeDexState {
  profile: Profile;
  sightings: Sighting[];
  collectionCards: CollectionCard[];
  leaderboardEntries: LeaderboardEntry[];
  currentUserId: string;
  pipeline: PipelineState;
  loading: boolean;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/* Seed data — folds in the EXISTING mock datasets                     */
/* ------------------------------------------------------------------ */

interface SeedEntry {
  recognition: RecognitionResult;
  baseRarity?: Rarity;
  daysAgo: number;
  streak: number;
  isFirstDiscovery: boolean;
  isDuplicate: boolean;
  lat: number;
  lng: number;
}

/**
 * The same 15-entry species table that previously lived in useMockCollection.
 * Kept here verbatim so the consolidated store reuses the existing dataset
 * instead of inventing a new one. XP/rarity are computed via the real scoring
 * engine, so values stay consistent with the scoring rules.
 */
const SEED_ENTRIES: SeedEntry[] = [
  { recognition: { category: 'animal', commonName: 'European Robin', scientificName: 'Erithacus rubecula', confidence: 0.93, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'common', daysAgo: 1, streak: 5, isFirstDiscovery: false, isDuplicate: false, lat: 51.505, lng: -0.09 },
  { recognition: { category: 'animal', commonName: 'Red Fox', scientificName: 'Vulpes vulpes', confidence: 0.88, captiveStatus: 'wild', sensitivity: 'low' }, baseRarity: 'uncommon', daysAgo: 3, streak: 10, isFirstDiscovery: true, isDuplicate: false, lat: 51.51, lng: -0.1 },
  { recognition: { category: 'animal', commonName: 'Great Spotted Woodpecker', scientificName: 'Dendrocopos major', confidence: 0.81, captiveStatus: 'wild', sensitivity: 'low' }, baseRarity: 'uncommon', daysAgo: 5, streak: 0, isFirstDiscovery: false, isDuplicate: false, lat: 51.52, lng: -0.08 },
  { recognition: { category: 'animal', commonName: 'Common Frog', scientificName: 'Rana temporaria', confidence: 0.76, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'common', daysAgo: 7, streak: 0, isFirstDiscovery: false, isDuplicate: false, lat: 51.499, lng: -0.087 },
  { recognition: { category: 'animal', commonName: 'Eagle Owl', scientificName: 'Bubo bubo', confidence: 0.91, captiveStatus: 'wild', sensitivity: 'protected' }, baseRarity: 'epic', daysAgo: 14, streak: 15, isFirstDiscovery: true, isDuplicate: false, lat: 51.48, lng: -0.12 },
  { recognition: { category: 'animal', commonName: 'Domestic Cat', scientificName: 'Felis catus', confidence: 0.97, captiveStatus: 'domestic', sensitivity: 'none' }, baseRarity: 'common', daysAgo: 0, streak: 20, isFirstDiscovery: false, isDuplicate: true, lat: 51.507, lng: -0.095 },
  { recognition: { category: 'plant', commonName: 'Common Dandelion', scientificName: 'Taraxacum officinale', confidence: 0.95, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'common', daysAgo: 2, streak: 5, isFirstDiscovery: false, isDuplicate: false, lat: 51.506, lng: -0.086 },
  { recognition: { category: 'plant', commonName: "Lady's Slipper Orchid", scientificName: 'Cypripedium calceolus', confidence: 0.84, captiveStatus: 'wild', sensitivity: 'protected' }, baseRarity: 'legendary', daysAgo: 30, streak: 25, isFirstDiscovery: true, isDuplicate: false, lat: 53.9, lng: -1.5 },
  { recognition: { category: 'plant', commonName: 'Common Nettle', scientificName: 'Urtica dioica', confidence: 0.92, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'common', daysAgo: 4, streak: 0, isFirstDiscovery: false, isDuplicate: false, lat: 51.503, lng: -0.092 },
  { recognition: { category: 'tree', commonName: 'English Oak', scientificName: 'Quercus robur', confidence: 0.89, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'uncommon', daysAgo: 10, streak: 0, isFirstDiscovery: false, isDuplicate: false, lat: 51.511, lng: -0.104 },
  { recognition: { category: 'tree', commonName: 'Silver Birch', scientificName: 'Betula pendula', confidence: 0.87, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'common', daysAgo: 8, streak: 0, isFirstDiscovery: false, isDuplicate: false, lat: 51.508, lng: -0.098 },
  { recognition: { category: 'tree', commonName: 'Common Yew', scientificName: 'Taxus baccata', confidence: 0.79, captiveStatus: 'wild', sensitivity: 'low' }, baseRarity: 'uncommon', daysAgo: 12, streak: 5, isFirstDiscovery: true, isDuplicate: false, lat: 51.495, lng: -0.102 },
  { recognition: { category: 'mushroom', commonName: 'Fly Agaric', scientificName: 'Amanita muscaria', confidence: 0.94, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'uncommon', daysAgo: 6, streak: 10, isFirstDiscovery: false, isDuplicate: false, lat: 51.52, lng: -0.115 },
  { recognition: { category: 'mushroom', commonName: 'Chanterelle', scientificName: 'Cantharellus cibarius', confidence: 0.82, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'uncommon', daysAgo: 9, streak: 0, isFirstDiscovery: false, isDuplicate: false, lat: 51.517, lng: -0.111 },
  { recognition: { category: 'mushroom', commonName: 'King Bolete', scientificName: 'Boletus edulis', confidence: 0.86, captiveStatus: 'wild', sensitivity: 'none' }, baseRarity: 'rare', daysAgo: 20, streak: 15, isFirstDiscovery: true, isDuplicate: false, lat: 51.523, lng: -0.107 },
];

const SEED_USER_ID = 'mock-user-001';
const SEED_USERNAME = 'Naturalist';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Build a Sighting from a seed entry using the real scoring engine. */
function buildSeedSighting(entry: SeedEntry, index: number, now: number): Sighting {
  const { recognition, baseRarity, daysAgo, streak, isFirstDiscovery, isDuplicate, lat, lng } = entry;

  const score = scoreSighting(
    {
      recognition,
      confidence: recognition.confidence,
      isDuplicate,
      captiveStatus: recognition.captiveStatus,
      sensitivity: recognition.sensitivity,
      qualityOk: true,
      isFirstDiscovery,
      streak,
    },
    baseRarity,
  );

  const card = buildCardMetadata(recognition, score);
  const publicLocation = getPublicLocation({ lat, lng }, recognition.sensitivity);
  const slug = slugify(recognition.commonName);
  const publicImageUri = `mock-card://${recognition.category}/${slug}/${score.rarity}/${score.xp}`;
  const createdAt = new Date(now - daysAgo * 86_400_000).toISOString();

  return {
    id: `mock-sighting-${index}`,
    userId: SEED_USER_ID,
    createdAt,
    category: recognition.category,
    commonName: recognition.commonName,
    scientificName: recognition.scientificName,
    confidence: recognition.confidence,
    rarity: score.rarity,
    xp: score.xp,
    captiveStatus: recognition.captiveStatus,
    sensitivity: recognition.sensitivity,
    privatePhotoUri: `file:///private/mock/${slug}.jpg`,
    publicImageUri,
    publicLocation,
    card,
    moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
  };
}

/** Derive a CollectionCard from a Sighting (1:1). */
function cardFromSighting(s: Sighting): CollectionCard {
  return {
    id: `card-${s.id}`,
    sightingId: s.id,
    card: s.card,
    publicImageUri: s.publicImageUri,
    rarity: s.rarity,
    createdAt: s.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Level math                                                          */
/* ------------------------------------------------------------------ */

/** Compute player level from cumulative XP (simple quadratic ladder). */
function xpToLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
}

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */

function createInitialState(): LifeDexState {
  const now = Date.now();
  const sightings = SEED_ENTRIES.map((e, i) => buildSeedSighting(e, i, now));
  // newest first
  sightings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const collectionCards = sightings.map(cardFromSighting);
  const totalXp = sightings.reduce((sum, s) => sum + s.xp, 0);

  const profile: Profile = {
    id: SEED_USER_ID,
    username: SEED_USERNAME,
    xp: totalXp,
    level: xpToLevel(totalXp),
  };

  return {
    profile,
    sightings,
    collectionCards,
    leaderboardEntries: MOCK_LEADERBOARD,
    currentUserId: MOCK_CURRENT_USER_ID,
    pipeline: { phase: 'idle' },
    loading: false,
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/* Store internals                                                     */
/* ------------------------------------------------------------------ */

type Listener = () => void;

class LifeDexStore {
  private state: LifeDexState = createInitialState();
  private listeners = new Set<Listener>();
  /** sightingId → Sighting, kept in lockstep with state.sightings for O(1) reads. */
  private sightingIndex = new Map<string, Sighting>(
    this.state.sightings.map((s) => [s.id, s]),
  );

  /** User-created captures only (NOT seed) — the persisted set. Newest first. */
  private userCaptures: PersistedCapture[] = [];

  /** Tracks the latest persist write so tests/callers can await it via flush(). */
  private persistPromise: Promise<void> = Promise.resolve();

  getSnapshot = (): LifeDexState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  private setState(next: LifeDexState): void {
    this.state = next;
    this.emit();
  }

  /* ----------------------------- Actions ---------------------------- */

  /**
   * Apply a new capture to state (no emit, no persist). Caller MUST have checked
   * the id is not already present. Prepends the sighting/card and credits XP.
   */
  private applyCapture(sighting: Sighting, card: CollectionCard): void {
    const newXp = this.state.profile.xp + sighting.xp;
    this.sightingIndex.set(sighting.id, sighting);
    this.state = {
      ...this.state,
      profile: { ...this.state.profile, xp: newXp, level: xpToLevel(newXp) },
      sightings: [sighting, ...this.state.sightings],
      collectionCards: [card, ...this.state.collectionCards],
    };
  }

  /**
   * Persist exactly one Sighting + one CollectionCard and credit XP.
   * Idempotent on sighting id. If `card` is omitted it is derived from the
   * sighting. The capture is also written to local storage so it survives an
   * app restart (best-effort; never blocks). Returns the persisted ids.
   */
  addSighting(sighting: Sighting, card?: CollectionCard): { sightingId: string; cardId: string } {
    const existing = this.sightingIndex.get(sighting.id);
    if (existing !== undefined) {
      const existingCard = this.state.collectionCards.find((c) => c.sightingId === sighting.id);
      return {
        sightingId: sighting.id,
        cardId: existingCard?.id ?? `card-${sighting.id}`,
      };
    }

    const collectionCard = card ?? cardFromSighting(sighting);
    this.applyCapture(sighting, collectionCard);
    this.emit();

    // Track + persist (newest first). Fire-and-forget; flush() awaits it.
    this.userCaptures = [{ sighting, card: collectionCard }, ...this.userCaptures];
    this.persistPromise = saveUserCaptures(this.userCaptures);

    return { sightingId: sighting.id, cardId: collectionCard.id };
  }

  /**
   * Load persisted user captures and merge them on top of the seed baseline.
   * Call once at app startup. Idempotent: captures already present are skipped.
   */
  async hydrate(): Promise<void> {
    const loaded = await loadUserCaptures();
    if (loaded.length === 0) return;

    this.userCaptures = loaded;
    let changed = false;
    // Stored newest-first; apply oldest-first so prepending restores the order.
    for (let i = loaded.length - 1; i >= 0; i--) {
      const cap = loaded[i];
      if (cap !== undefined && !this.sightingIndex.has(cap.sighting.id)) {
        this.applyCapture(cap.sighting, cap.card);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  /** Resolves once the most recent persist write has settled (for tests/flows). */
  flush(): Promise<void> {
    return this.persistPromise;
  }

  getSightingById(id: string): Sighting | undefined {
    return this.sightingIndex.get(id);
  }

  getCardById(id: string): CollectionCard | undefined {
    return this.state.collectionCards.find((c) => c.id === id);
  }

  listCollection(): CollectionCard[] {
    return this.state.collectionCards;
  }

  listSightings(): Sighting[] {
    return this.state.sightings;
  }

  getLeaderboard(): LeaderboardEntry[] {
    return this.state.leaderboardEntries;
  }

  getProfile(): Profile {
    return this.state.profile;
  }

  setPipelineState(pipeline: PipelineState): void {
    this.setState({ ...this.state, pipeline });
  }

  setLoading(loading: boolean): void {
    this.setState({ ...this.state, loading });
  }

  setError(error: string | null): void {
    this.setState({ ...this.state, error });
  }

  /**
   * Restore the in-memory state to the seeded baseline. Clears tracked user
   * captures but does NOT touch local storage — use clearUserCaptures() for a
   * full factory reset. Primarily used by tests and a "simulated restart".
   */
  reset(): void {
    this.state = createInitialState();
    this.sightingIndex = new Map(this.state.sightings.map((s) => [s.id, s]));
    this.userCaptures = [];
    this.emit();
  }
}

/* ------------------------------------------------------------------ */
/* Singleton                                                           */
/* ------------------------------------------------------------------ */

export const lifeDexStore = new LifeDexStore();

/* ------------------------------------------------------------------ */
/* Derived selectors (pure functions over state)                       */
/* ------------------------------------------------------------------ */

/** Recent discoveries, newest first (derived from sightings). */
export function selectRecentDiscoveries(state: LifeDexState, limit = 6): Sighting[] {
  return state.sightings.slice(0, limit);
}

/** Count of sightings created in the last 24h. */
export function selectTodayCount(state: LifeDexState): number {
  const oneDayMs = 24 * 3_600_000;
  const now = Date.now();
  return state.sightings.filter((s) => now - new Date(s.createdAt).getTime() < oneDayMs).length;
}

/** Total unique species (by commonName). */
export function selectTotalSpecies(state: LifeDexState): number {
  return new Set(state.sightings.map((s) => s.commonName)).size;
}

/* ------------------------------------------------------------------ */
/* React hook                                                          */
/* ------------------------------------------------------------------ */

export interface UseLifeDexStore extends LifeDexState {
  addSighting: (s: Sighting, card?: CollectionCard) => { sightingId: string; cardId: string };
  getSightingById: (id: string) => Sighting | undefined;
  getCardById: (id: string) => CollectionCard | undefined;
  listCollection: () => CollectionCard[];
  listSightings: () => Sighting[];
  getLeaderboard: () => LeaderboardEntry[];
  getProfile: () => Profile;
  setPipelineState: (p: PipelineState) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

/**
 * Subscribe any component to the LifeDex store. Re-renders only when state
 * reference changes (referential-equality check in useSyncExternalStore).
 */
export function useLifeDexStore(): UseLifeDexStore {
  const state = useSyncExternalStore(
    lifeDexStore.subscribe,
    lifeDexStore.getSnapshot,
    lifeDexStore.getSnapshot, // SSR / server snapshot
  );

  return {
    ...state,
    addSighting: (s, card) => lifeDexStore.addSighting(s, card),
    getSightingById: (id) => lifeDexStore.getSightingById(id),
    getCardById: (id) => lifeDexStore.getCardById(id),
    listCollection: () => lifeDexStore.listCollection(),
    listSightings: () => lifeDexStore.listSightings(),
    getLeaderboard: () => lifeDexStore.getLeaderboard(),
    getProfile: () => lifeDexStore.getProfile(),
    setPipelineState: (p) => lifeDexStore.setPipelineState(p),
    setLoading: (b) => lifeDexStore.setLoading(b),
    setError: (e) => lifeDexStore.setError(e),
    reset: () => lifeDexStore.reset(),
  };
}
