/**
 * Achievement catalogue — pure, deterministic, no I/O, no React.
 *
 * This module only computes ids + unlock state + progress + icon from
 * sightings/streak data. ALL display strings (title/description) are owned by
 * the screen, looked up by `id` from its own local i18n catalog — that keeps
 * this module trivially unit-testable and free of any UI/localization concern.
 *
 * "Unique species" = distinct `scientificName ?? commonName` (see
 * src/domain/stats.ts, the single source for that definition).
 *
 * `icon` is typed against the real Ionicons glyph set (import type only — no
 * runtime dependency on the icon library, so this stays a pure domain module).
 */
import type { Ionicons } from '@expo/vector-icons';

import type { Category, Rarity, Sighting } from '@/domain/types';
import { computeStats } from '@/domain/stats';

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface Achievement {
  id: string;
  unlocked: boolean;
  progress: AchievementProgress;
  icon: keyof typeof Ionicons.glyphMap;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Rarity ordered low -> high so "first-X" achievements count X-or-rarer catches
 * (e.g. a legendary find also satisfies "first-rare"). */
const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/** The four "collectible" categories tracked by all-categories (excludes 'unknown'). */
const CORE_CATEGORIES: readonly Category[] = ['animal', 'plant', 'tree', 'mushroom'];

const ONE_DAY_MS = 24 * 3_600_000;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function countAtLeastRarity(sightings: Sighting[], min: Rarity): number {
  const minRank = RARITY_RANK[min];
  return sightings.filter((s) => RARITY_RANK[s.rarity] >= minRank).length;
}

function countToday(sightings: Sighting[], now: number): number {
  return sightings.filter((s) => now - new Date(s.createdAt).getTime() < ONE_DAY_MS).length;
}

function countWild(sightings: Sighting[]): number {
  return sightings.filter((s) => s.captiveStatus === 'wild').length;
}

/** Progress is capped at target — a locked tile's "current/target" never overshoots. */
function progressOf(current: number, target: number): AchievementProgress {
  return { current: Math.min(Math.max(0, current), target), target };
}

function build(
  id: string,
  icon: keyof typeof Ionicons.glyphMap,
  current: number,
  target: number,
): Achievement {
  return {
    id,
    unlocked: current >= target,
    progress: progressOf(current, target),
    icon,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Compute the full ~12-entry achievement catalogue from the current sightings
 * and daily streak. Stable ids (never renumber/reuse — the screen's i18n
 * catalog keys off them):
 *
 *   first-find     - 1st capture ever
 *   finds-25       - 25 total captures (volume)
 *   species-10     - 10 unique species
 *   species-25     - 25 unique species
 *   species-50     - 50 unique species
 *   all-categories - at least 1 animal + plant + tree + mushroom
 *   first-rare     - 1st rare-or-better find
 *   first-epic     - 1st epic-or-better find
 *   first-legendary- 1st legendary find
 *   streak-7       - 7-day capture streak
 *   today-3        - 3 captures today
 *   wild-explorer  - 10 wild (non-captive) captures
 *   first-sample   - file 1 sample on the Solo Lab bench
 *   field-researcher- file 5 samples on the Solo Lab bench
 *   lab-patron     - file 15 samples on the Solo Lab bench
 *
 * The "today" bucket is evaluated against the real wall clock, matching the
 * same convention as `selectTodayCount` in useLifeDexStore.ts.
 *
 * `sampleCount` (Solo Lab filed-sample total, src/store/lab.ts) is an OPTIONAL
 * 3rd argument, defaulting to 0 — every existing caller that only tracks
 * sightings/streak is unaffected. It drives ONLY the three lab achievements
 * above; nothing else here reads it.
 */
export function computeAchievements(
  sightings: Sighting[],
  streak: number,
  sampleCount = 0,
): Achievement[] {
  const now = Date.now();
  const stats = computeStats(sightings);
  const categoriesPresent = CORE_CATEGORIES.filter((c) => stats.byCategory[c] > 0).length;

  return [
    build('first-find', 'footsteps-outline', stats.totalFinds, 1),
    build('finds-25', 'ribbon', stats.totalFinds, 25),
    build('species-10', 'leaf-outline', stats.totalSpecies, 10),
    build('species-25', 'leaf', stats.totalSpecies, 25),
    build('species-50', 'planet-outline', stats.totalSpecies, 50),
    build('all-categories', 'grid', categoriesPresent, CORE_CATEGORIES.length),
    build('first-rare', 'star-outline', countAtLeastRarity(sightings, 'rare'), 1),
    build('first-epic', 'star', countAtLeastRarity(sightings, 'epic'), 1),
    build('first-legendary', 'trophy', stats.byRarity.legendary, 1),
    build('streak-7', 'flame', streak, 7),
    build('today-3', 'today-outline', countToday(sightings, now), 3),
    build('wild-explorer', 'paw-outline', countWild(sightings), 10),
    build('first-sample', 'flask-outline', sampleCount, 1),
    build('field-researcher', 'flask', sampleCount, 5),
    build('lab-patron', 'school-outline', sampleCount, 15),
  ];
}
