/**
 * computeStats — aggregate counters over a sightings list.
 *
 * Pure, deterministic, no I/O. Feeds the Stats screen's category/rarity
 * breakdown; also reused by achievements.ts so "unique species" and
 * per-category counts are derived exactly once.
 *
 * "Unique species" = distinct `scientificName ?? commonName` (case-insensitive).
 */
import type { Category, Rarity, Sighting } from '@/domain/types';

export interface Stats {
  totalFinds: number;
  totalSpecies: number;
  byCategory: Record<Category, number>;
  byRarity: Record<Rarity, number>;
}

const ZERO_BY_CATEGORY: Record<Category, number> = {
  animal: 0,
  plant: 0,
  tree: 0,
  mushroom: 0,
  unknown: 0,
};

const ZERO_BY_RARITY: Record<Rarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
};

/** Stable per-sighting species key: scientific name wins when present. */
export function uniqueSpeciesKey(s: Sighting): string {
  return (s.scientificName ?? s.commonName).trim().toLowerCase();
}

/** Aggregate totals/category/rarity breakdown over a sightings list. */
export function computeStats(sightings: Sighting[]): Stats {
  const byCategory: Record<Category, number> = { ...ZERO_BY_CATEGORY };
  const byRarity: Record<Rarity, number> = { ...ZERO_BY_RARITY };

  for (const s of sightings) {
    byCategory[s.category] += 1;
    byRarity[s.rarity] += 1;
  }

  return {
    totalFinds: sightings.length,
    totalSpecies: new Set(sightings.map(uniqueSpeciesKey)).size,
    byCategory,
    byRarity,
  };
}
