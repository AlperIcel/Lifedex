/**
 * Daily quests + Species of the Day — LifeDex's daily-loop domain module.
 * Pure, deterministic, no I/O, no React (mirrors src/domain/achievements.ts).
 *
 * The daily loop is the retention backbone: every calendar day (keyed by
 * `dayKey`, 'YYYY-MM-DD', UTC — same convention as src/domain/streak.ts:
 * "Days are compared in UTC; stable across the app, good enough for a game")
 * the player gets `QUESTS_PER_DAY` quests deterministically SELECTED FROM the
 * day key (a seeded shuffle of a small template pool below) plus one rotating
 * "Species of the Day" highlight pulled from the curated SPECIES_RULES
 * catalogue. Same dayKey always yields the same quests/species; different days
 * usually differ (seeded shuffle, not a fixed rotation).
 *
 * Like achievements.ts, this module returns ONLY id/target/current/done — ALL
 * display strings (title, icon choice) belong to the screen's own co-located
 * i18n catalog, keyed by the stable `DailyQuestId`. That keeps this module
 * trivially unit-testable and free of any UI/localization concern.
 *
 * Determinism rule (project-wide): no Date.now()/Math.random() in here — the
 * caller (store/screen) supplies "now" via `dayKey`, exactly like
 * `dailyQuestsFor`/`speciesOfTheDay` below. The seeded PRNG (mulberry32) is a
 * tiny, dependency-free, NON-cryptographic shuffle — good enough to rotate a
 * short UI list, not for anything security-sensitive.
 */
import { uniqueSpeciesKey } from '@/domain/stats';
import { SPECIES_RULES } from '@/domain/speciesRules';
import { hashString, seededShuffle } from '@/domain/seededRotation';
import type { Category, Rarity, Sighting } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export interface DailyQuest {
  id: DailyQuestId;
  target: number;
  current: number;
  done: boolean;
}

export interface SpeciesOfDay {
  name: string;
  scientificName?: string;
  /**
   * Rarity tier from the chosen SPECIES_RULES entry (rule.baseRarity) — lets the
   * Species-of-Day info screen (SpeciesOfDayScreen) render a RarityBadge without
   * a second catalogue lookup.
   */
  rarity: Rarity;
  /** Category from the chosen SPECIES_RULES entry (rule.category). */
  category: Category;
}

/**
 * Small flat XP bonus for claiming a fully-completed daily quest set (see
 * `claimDailyReward` in useLifeDexStore.ts). Deliberately NOT part of
 * scoring.ts's economy — this is a login/engagement reward, not a capture
 * reward, so it stays out of the rarity/streak/confidence machinery entirely.
 * Value sits below a single 'uncommon' catch (30 XP — see scoring.ts's
 * BASE_XP) so real photography stays the primary progression path; well above
 * a 'common' catch (10 XP) so it still feels worth collecting.
 */
export const DAILY_REWARD_XP = 20;

/** How many quests are offered per day. */
export const QUESTS_PER_DAY = 3;

/* ------------------------------------------------------------------ */
/* Day key                                                             */
/* ------------------------------------------------------------------ */

/**
 * 'YYYY-MM-DD' day key for an ISO timestamp, in UTC (same convention as
 * streak.ts). Falls back to a best-effort slice of the raw string when `Date`
 * can't parse it, so the function is total (never throws) rather than
 * crashing the daily-loop UI on unexpected input.
 */
export function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Quest pool                                                          */
/* ------------------------------------------------------------------ */

/**
 * The full template pool `selectQuestIdsForDay` rotates `QUESTS_PER_DAY`
 * entries from. Stable ids (never renumber/reuse — the screen's i18n catalog
 * and icon lookup key off them):
 *
 *   species-3         - catch 3 distinct species today
 *   category-animal   - catch an animal today
 *   category-plant    - catch a plant today
 *   category-tree     - catch a tree today
 *   category-mushroom - catch a mushroom today
 *   rare-or-new       - catch something rare-or-better OR a first discovery
 *   volume-5          - log 5 sightings today (any species)
 *   wild-1            - catch something wild (non-captive) today
 */
export const DAILY_QUEST_IDS = [
  'species-3',
  'category-animal',
  'category-plant',
  'category-tree',
  'category-mushroom',
  'rare-or-new',
  'volume-5',
  'wild-1',
] as const;

export type DailyQuestId = (typeof DAILY_QUEST_IDS)[number];

/** Rarity tiers that satisfy the "rare-or-new" quest on their own (no first-discovery needed). */
const RARE_OR_BETTER = new Set<Rarity>(['rare', 'epic', 'legendary']);

interface QuestDef {
  target: number;
  /** Counts progress from an ALREADY day-filtered sightings array. */
  count: (today: Sighting[]) => number;
}

const QUEST_DEFS: Record<DailyQuestId, QuestDef> = {
  'species-3': {
    target: 3,
    count: (today) => new Set(today.map(uniqueSpeciesKey)).size,
  },
  'category-animal': {
    target: 1,
    count: (today) => today.filter((s) => s.category === 'animal').length,
  },
  'category-plant': {
    target: 1,
    count: (today) => today.filter((s) => s.category === 'plant').length,
  },
  'category-tree': {
    target: 1,
    count: (today) => today.filter((s) => s.category === 'tree').length,
  },
  'category-mushroom': {
    target: 1,
    count: (today) => today.filter((s) => s.category === 'mushroom').length,
  },
  'rare-or-new': {
    target: 1,
    count: (today) =>
      today.filter((s) => RARE_OR_BETTER.has(s.rarity) || s.isFirstDiscovery === true).length,
  },
  'volume-5': {
    target: 5,
    count: (today) => today.length,
  },
  'wild-1': {
    target: 1,
    count: (today) => today.filter((s) => s.captiveStatus === 'wild').length,
  },
};

/** Progress is capped at target — a quest's "current/target" never overshoots. */
function clampCount(current: number, target: number): number {
  return Math.min(Math.max(0, current), target);
}

/**
 * Build one quest's live progress from an ALREADY day-filtered sightings array
 * (see `dailyQuestsFor`, which does the filtering). Exported separately from
 * day-selection so each quest type's counting logic is directly unit-testable
 * without needing to know which ids a given day happens to rotate in.
 */
export function computeDailyQuest(id: DailyQuestId, todaySightings: Sighting[]): DailyQuest {
  const def = QUEST_DEFS[id];
  const current = clampCount(def.count(todaySightings), def.target);
  return { id, target: def.target, current, done: current >= def.target };
}

/**
 * The `QUESTS_PER_DAY` quest ids offered on `dayKey`, deterministically
 * shuffled from the template pool (seeded by a hash of dayKey — the same day
 * always yields the same ids; different days usually differ).
 */
export function selectQuestIdsForDay(dayKey: string): DailyQuestId[] {
  const seed = hashString(dayKey);
  return seededShuffle(DAILY_QUEST_IDS, seed).slice(0, QUESTS_PER_DAY);
}

/**
 * The day's daily quests with live progress from `sightings` (filtered to
 * `dayKey` internally — a capture from yesterday never counts toward today).
 */
export function dailyQuestsFor(dayKey: string, sightings: Sighting[]): DailyQuest[] {
  const today = sightings.filter((s) => dayKeyOf(s.createdAt) === dayKey);
  return selectQuestIdsForDay(dayKey).map((id) => computeDailyQuest(id, today));
}

/* ------------------------------------------------------------------ */
/* Species of the Day                                                  */
/* ------------------------------------------------------------------ */

/**
 * The "Species of the Day" spotlight is meant to send the player OUTSIDE to
 * find something — so it excludes the catalogue's domestic entries (a house
 * cat/dog isn't a discovery). Filtered once at module load; `SPECIES_RULES`
 * itself (imported read-only from speciesRules.ts) is left untouched.
 */
const SPECIES_OF_DAY_POOL = SPECIES_RULES.filter(
  (r) => r.commonName !== 'Domestic Cat' && r.commonName !== 'Domestic Dog',
);

/**
 * A deterministic daily highlight pulled from the curated SPECIES_RULES
 * catalogue (minus domestic entries — see SPECIES_OF_DAY_POOL). Salted
 * differently from quest selection (`species:` prefix) so the two rotations
 * don't visibly correlate day to day. Carries the chosen rule's rarity and
 * category alongside name/scientificName — this is an INFORMATIONAL spotlight
 * (see SpeciesOfDayScreen), not a capture prompt, so the screen needs enough
 * to render a RarityBadge + category label without a second catalogue lookup.
 * Pure/deterministic: no Date.now()/Math.random(), same dayKey always yields
 * the same result.
 */
export function speciesOfTheDay(dayKey: string): SpeciesOfDay {
  const seed = hashString(`species:${dayKey}`);
  const idx = seed % SPECIES_OF_DAY_POOL.length;
  // SPECIES_OF_DAY_POOL is a non-empty static catalogue; idx is always in range.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const rule = SPECIES_OF_DAY_POOL[idx]!;
  return {
    name: rule.commonName,
    scientificName: rule.scientificName,
    rarity: rule.baseRarity,
    category: rule.category,
  };
}
