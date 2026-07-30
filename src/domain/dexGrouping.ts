/**
 * dexGrouping — pure domain logic for the "Living-Dex" Collection screen.
 *
 * WHY: a flat list of owned cards only shows what the player HAS. The pull of
 * a "gotta catch 'em all" collection game comes from what's MISSING — seeing
 * the shape of the gaps is what keeps players hunting (2026-07-29 audit/CEO
 * note). This module turns the player's caught sightings + the on-device
 * `SPECIES_RULES` catalogue (`speciesRules.ts`) into a per-category structure
 * of owned tiles and dimmed "silhouette" gaps for species not yet caught.
 *
 * SECTIONS: the four categories the catalogue actually covers, in a fixed,
 * deterministic order — animal, plant, tree, mushroom (`DEX_CATEGORIES`). A
 * fifth 'unknown' section is appended ONLY when the player has at least one
 * caught sighting the recogniser itself could not categorise (a low-confidence
 * fallback — see `inatMapping.ts` / `mockVision.ts`); it never contributes to
 * any completion total and is omitted entirely when empty, so the common case
 * never shows a stray empty bucket.
 *
 * BONUS FINDS (design decision): the curated catalogue is ~47 species;
 * iNaturalist alone recognises hundreds of thousands, so most real catches
 * will NOT be in `SPECIES_RULES`. Those catches are real and worth
 * celebrating, so they ARE shown, in their category, among the caught tiles
 * (newest first) and marked `isBonus: true` — but they do NOT increment that
 * section's `caught` count or its `total`. If they did, catching enough
 * uncatalogued species would push a category's completion past 100%, which
 * would break the "honest completion" bar this screen shows (the whole point
 * of this revamp). Catalogue completion can therefore only ever reach exactly
 * 100% by catching every catalogued species; bonus finds are a separate,
 * uncapped tally (`bonusCaught`).
 *
 * MATCHING: a caught sighting is resolved to a catalogue slot via
 * `resolveSpeciesRule` (scientific name preferred, common name fallback — the
 * same authoritative match already used for rarity/sensitivity). A sighting
 * that resolves to a rule is filed under THAT rule's category (the catalogue
 * is authoritative about identity), even in the rare case its own
 * `sighting.category` differs (e.g. a low-confidence 'unknown' classification
 * that still matched a known name by text). Only sightings with NO rule match
 * fall back to their own `sighting.category` — see `identityKey` for how those
 * are deduplicated.
 *
 * Pure / deterministic: no I/O, no Date.now(), no randomness. `rows` should be
 * newest-first (matches `useLifeDexStore`'s `collectionCards` ordering) so
 * that, when a species was caught more than once, the tile shown is the most
 * recent catch — first occurrence per identity wins. Within each section the
 * caught tiles are shown first (newest catch on top, catalogue + bonus
 * intermixed by recency), then the locked silhouettes.
 */
import { resolveSpeciesRule, SPECIES_RULES } from './speciesRules';
import type { Category, Rarity, Sighting } from './types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Fixed, deterministic section order — the four categories the catalogue covers. */
export const DEX_CATEGORIES: readonly Category[] = ['animal', 'plant', 'tree', 'mushroom'];

/** Minimal shape needed from a collection row (structurally matches CollectionScreen's CardRow). */
export interface DexSightingRow {
  cardId: string;
  sighting: Sighting;
}

/** An owned tile — a catalogue species that's been caught, or a bonus find. */
export interface DexCaughtEntry {
  kind: 'caught';
  /** Stable, unique key for list rendering. */
  key: string;
  cardId: string;
  sighting: Sighting;
  /** True when this species has no SPECIES_RULES entry — shown, but excluded from caught/total. */
  isBonus: boolean;
}

/**
 * A catalogue species not yet caught — rendered as a dimmed silhouette. The UI
 * must NOT reveal `commonName` to the player (that would defeat the point);
 * it's exposed here for stable keys and for tests.
 */
export interface DexLockedEntry {
  kind: 'locked';
  key: string;
  category: Category;
  commonName: string;
  baseRarity: Rarity;
}

export type DexEntry = DexCaughtEntry | DexLockedEntry;

export interface DexSection {
  category: Category;
  /** Caught tiles first (newest catch on top, catalogue + bonus by recency), then locked silhouettes. */
  entries: DexEntry[];
  /** Unique catalogued species caught in this category (excludes bonus finds). */
  caught: number;
  /** Catalogue size for this category (0 for the bonus-only 'unknown' bucket). */
  total: number;
  /** Unique non-catalogued species caught in this category — shown, uncounted above. */
  bonusCaught: number;
}

export interface DexResult {
  sections: DexSection[];
  /** Sum of every section's `caught` — catalogued species owned. */
  totalCaught: number;
  /** Sum of every section's `total` — always equals SPECIES_RULES.length. */
  totalSpecies: number;
}

/* ------------------------------------------------------------------ */
/* Identity for bonus (non-catalogued) sightings                       */
/* ------------------------------------------------------------------ */

/**
 * Identity key for a sighting that has NO catalogue rule: scientific name when
 * present, else common name (case/whitespace-insensitive) — mirrors
 * `stats.ts`'s `uniqueSpeciesKey`, reimplemented locally so two sightings a
 * human would call "the same species" collapse to one bonus entry.
 */
function identityKey(sighting: Sighting): string {
  return (sighting.scientificName ?? sighting.commonName).trim().toLowerCase();
}

/**
 * Newest-first comparator by ISO `createdAt` (lexicographic order on an ISO
 * timestamp is chronological). Pure — reads only a field already on the input.
 */
function byCreatedAtDesc(a: DexCaughtEntry, b: DexCaughtEntry): number {
  const x = a.sighting.createdAt;
  const y = b.sighting.createdAt;
  return x < y ? 1 : x > y ? -1 : 0;
}

/* ------------------------------------------------------------------ */
/* Core                                                                */
/* ------------------------------------------------------------------ */

/**
 * Build the Living-Dex structure from the player's collection rows.
 *
 * @param rows newest-first collection rows (cardId + resolved Sighting) — when
 *   a species was caught more than once, the newest row wins the tile shown.
 */
export function buildDex(rows: readonly DexSightingRow[]): DexResult {
  /** First (= newest, given newest-first input) row per catalogue rule. */
  const caughtByRuleName = new Map<string, DexSightingRow>();
  /** First (= newest) row per bonus identity — species with no catalogue rule. */
  const bonusByIdentity = new Map<string, DexSightingRow>();

  for (const row of rows) {
    const rule = resolveSpeciesRule(row.sighting.commonName, row.sighting.scientificName);
    if (rule !== undefined) {
      if (!caughtByRuleName.has(rule.commonName)) {
        caughtByRuleName.set(rule.commonName, row);
      }
    } else {
      const key = identityKey(row.sighting);
      if (!bonusByIdentity.has(key)) {
        bonusByIdentity.set(key, row);
      }
    }
  }

  const bonusRows = [...bonusByIdentity.values()];

  const sections: DexSection[] = DEX_CATEGORIES.map((category) => {
    const catalogue = SPECIES_RULES.filter((rule) => rule.category === category);

    const catalogueEntries: DexEntry[] = catalogue.map((rule): DexEntry => {
      const row = caughtByRuleName.get(rule.commonName);
      if (row !== undefined) {
        return {
          kind: 'caught',
          key: `caught:${rule.commonName}`,
          cardId: row.cardId,
          sighting: row.sighting,
          isBonus: false,
        };
      }
      return {
        kind: 'locked',
        key: `locked:${rule.commonName}`,
        category,
        commonName: rule.commonName,
        baseRarity: rule.baseRarity,
      };
    });

    const caughtCatalogue = catalogueEntries.filter(
      (e): e is DexCaughtEntry => e.kind === 'caught',
    );
    const locked = catalogueEntries.filter((e): e is DexLockedEntry => e.kind === 'locked');

    const bonusEntries: DexCaughtEntry[] = bonusRows
      .filter((row) => row.sighting.category === category)
      .map(
        (row): DexCaughtEntry => ({
          kind: 'caught',
          key: `bonus:${category}:${identityKey(row.sighting)}`,
          cardId: row.cardId,
          sighting: row.sighting,
          isBonus: true,
        }),
      );

    // Discoveries first — newest catch on top, catalogue + bonus intermixed by
    // recency — then the still-locked silhouettes (see the module header).
    const caughtNewestFirst = [...caughtCatalogue, ...bonusEntries].sort(byCreatedAtDesc);

    return {
      category,
      entries: [...caughtNewestFirst, ...locked],
      caught: caughtCatalogue.length,
      total: catalogue.length,
      bonusCaught: bonusEntries.length,
    };
  });

  // Bonus-only 'unknown' bucket — only when the recogniser itself couldn't
  // categorise a caught sighting. Omitted entirely when empty (the common case).
  const unknownRows = bonusRows.filter((row) => row.sighting.category === 'unknown');
  if (unknownRows.length > 0) {
    const unknownEntries: DexCaughtEntry[] = unknownRows.map(
      (row): DexCaughtEntry => ({
        kind: 'caught',
        key: `bonus:unknown:${identityKey(row.sighting)}`,
        cardId: row.cardId,
        sighting: row.sighting,
        isBonus: true,
      }),
    );
    sections.push({
      category: 'unknown',
      entries: [...unknownEntries].sort(byCreatedAtDesc),
      caught: 0,
      total: 0,
      bonusCaught: unknownEntries.length,
    });
  }

  const totalCaught = sections.reduce((sum, s) => sum + s.caught, 0);
  const totalSpecies = sections.reduce((sum, s) => sum + s.total, 0);

  return { sections, totalCaught, totalSpecies };
}
