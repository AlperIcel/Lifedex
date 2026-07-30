/**
 * Solo Lab — pure domain module for LifeDex's single-player "research bench".
 * Pure, deterministic, no I/O, no React (mirrors src/domain/dailyQuests.ts /
 * src/domain/achievements.ts).
 *
 * DESIGN STANCE: the Solo Lab is the player's field bench, NOT a fake
 * community. Submitting a sample pays out IMMEDIATELY — consume a vial, mint
 * research points, file the specimen with its global-rarity intel, maybe
 * unlock an achievement. There are no dead buttons, no fake progress counters,
 * no simulated other players. Community verification is a single copy-only
 * teaser for v1.1 (see LabScreen). Gadgets never gate the core catch -> card
 * loop: vials gate only LAB SUBMISSION, and the Makro-Linse only ADDS XP.
 *
 * This module returns/computes ids, numbers and gate results only — ALL
 * display strings belong to the screen's own co-located i18n catalog
 * (ResultScreen.tsx / LabScreen.tsx), keyed by the stable `GadgetId`s and
 * reason strings below. That keeps this module trivially unit-testable and
 * free of any UI/localization concern.
 */
import { resolveSpeciesRule } from '@/domain/speciesRules';
import { uniqueSpeciesKey } from '@/domain/stats';
import { hashString } from '@/domain/seededRotation';
import type { Category, RecognitionResult, Rarity, Sighting } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Append-only, stable — never renumber/reuse (persisted in the lab store). */
export type GadgetId = 'labor-pass' | 'makro-linse';

/** One filed specimen on the player's research bench. */
export interface LabSample {
  sightingId: string;
  speciesKey: string;
  commonName: string;
  scientificName?: string;
  category: Category;
  rarity: Rarity;
  observationsCount?: number;
  submittedAt: string;
}

/* ------------------------------------------------------------------ */
/* Tuning — one tunable block, like OBSERVATION_RARITY_THRESHOLDS        */
/* ------------------------------------------------------------------ */

export const LAB_TUNING = {
  startingVials: 3,
  vialPriceRp: 10,
  dailyClaimVialBonus: 1,
  /** Flat research points awarded the instant a sample is filed (submitSample). */
  submitRp: 5,
  rpByRarity: { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 15 },
  firstDiscoveryRpMultiplier: 2,
  focusRpMultiplier: 2,
  macroLensXpBonus: 0.15,
  gadgets: {
    'labor-pass': { minLevel: 5, priceRp: 30 },
    'makro-linse': { minLevel: 10, priceRp: 40 },
  },
} as const;

/* ------------------------------------------------------------------ */
/* Bonus finds (uncatalogued species)                                  */
/* ------------------------------------------------------------------ */

/**
 * True when `s` is NOT in the curated SPECIES_RULES catalogue — a "special
 * find" the Solo Lab wants a sample of. Thin wrapper so callers never need to
 * know the underlying resolver.
 */
export function isBonusFind(s: Pick<Sighting, 'commonName' | 'scientificName'>): boolean {
  return resolveSpeciesRule(s.commonName, s.scientificName) === undefined;
}

/**
 * Gate for submitting `sighting` as a lab sample: bonus finds only, one
 * sample per species (by `uniqueSpeciesKey`), and a vial must be available.
 * Checked in priority order — the most fundamental reason wins first.
 */
export function canSubmitSample(
  sighting: Sighting,
  samples: LabSample[],
  vials: number,
): { ok: true } | { ok: false; reason: 'not-bonus' | 'already-sampled' | 'no-vials' } {
  if (!isBonusFind(sighting)) return { ok: false, reason: 'not-bonus' };
  const key = uniqueSpeciesKey(sighting);
  if (samples.some((s) => s.speciesKey === key)) return { ok: false, reason: 'already-sampled' };
  if (vials <= 0) return { ok: false, reason: 'no-vials' };
  return { ok: true };
}

/** Build the persisted sample row for `sighting` at `nowISO`. Pure — no id minting, no I/O. */
export function buildSample(sighting: Sighting, nowISO: string): LabSample {
  return {
    sightingId: sighting.id,
    speciesKey: uniqueSpeciesKey(sighting),
    commonName: sighting.commonName,
    scientificName: sighting.scientificName,
    category: sighting.category,
    rarity: sighting.rarity,
    observationsCount: sighting.observationsCount,
    submittedAt: nowISO,
  };
}

/* ------------------------------------------------------------------ */
/* Research points per catch                                           */
/* ------------------------------------------------------------------ */

/**
 * Research points credited for ONE catch (called on every non-duplicate
 * sighting, regardless of rarity or curation — this is the Lab's passive
 * income, separate from `submitRp`'s one-off filing bonus). Always an
 * integer; multipliers stack multiplicatively.
 */
export function rpForCatch(
  rarity: Rarity,
  isFirstDiscovery: boolean,
  isFocusCategory: boolean,
): number {
  const base = LAB_TUNING.rpByRarity[rarity];
  const mult =
    (isFirstDiscovery ? LAB_TUNING.firstDiscoveryRpMultiplier : 1) *
    (isFocusCategory ? LAB_TUNING.focusRpMultiplier : 1);
  return Math.round(base * mult);
}

/* ------------------------------------------------------------------ */
/* Gadget shop gate                                                    */
/* ------------------------------------------------------------------ */

/**
 * Gate for buying gadget `id`. Checked in priority order: already owning it
 * is the most specific reason (regardless of level/rp), then the level
 * requirement, then price.
 */
export function canBuyGadget(
  id: GadgetId,
  level: number,
  rp: number,
  owned: GadgetId[],
): { ok: true } | { ok: false; reason: 'level' | 'rp' | 'owned' } {
  if (owned.includes(id)) return { ok: false, reason: 'owned' };
  const def = LAB_TUNING.gadgets[id];
  if (level < def.minLevel) return { ok: false, reason: 'level' };
  if (rp < def.priceRp) return { ok: false, reason: 'rp' };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Weekly research focus                                              */
/* ------------------------------------------------------------------ */

/**
 * ISO-week key ('YYYY-Www') for an ISO timestamp, in UTC. Same "good enough
 * for a game" stance as dailyQuests.ts's `dayKeyOf`: total (never throws),
 * falls back to a best-effort slice of the raw string when `Date` can't parse
 * it, rather than crashing the weekly-focus UI on unexpected input.
 */
export function weekKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);

  // Standard ISO-8601 week algorithm, computed entirely in UTC: shift to the
  // Thursday of the same week (ISO weeks are anchored on Thursday), then
  // count whole weeks since that Thursday's year began.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Monday=1 .. Sunday=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** The four categories the weekly research focus rotates through. */
const LAB_FOCUS_CATEGORIES: readonly Category[] = ['animal', 'plant', 'tree', 'mushroom'];

/**
 * The Lab's rotating weekly research focus — a deterministic seeded pick, one
 * per ISO week. Salted differently from dailyQuests.ts's rotations (`lab-focus:`
 * prefix) so this doesn't visibly correlate with the daily quest/species pick.
 * Same weekKey always yields the same category; different weeks usually differ.
 */
export function labFocusForWeek(weekKey: string): Category {
  const seed = hashString(`lab-focus:${weekKey}`);
  const idx = seed % LAB_FOCUS_CATEGORIES.length;
  // LAB_FOCUS_CATEGORIES is a fixed non-empty array; idx is always in range.
  return LAB_FOCUS_CATEGORIES[idx] ?? 'animal';
}

/* ------------------------------------------------------------------ */
/* Macro Lens qualification                                            */
/* ------------------------------------------------------------------ */

/** Iconic taxa the Makro-Linse gadget considers "small subjects". */
const MACRO_ICONIC_TAXA = new Set(['Insecta', 'Arachnida', 'Mollusca']);

/** Subject boxes at or below this normalized area count as "small" (see file header). */
const MACRO_MAX_SUBJECT_AREA = 0.18;

/**
 * True when a catch qualifies for the Makro-Linse's XP bonus: the taxon is an
 * insect/arachnid/mollusc, OR the category is mushroom, OR the detected
 * subject box is small (width*height <= 0.18 of the frame).
 *
 * `subjectBox` is ALWAYS undefined for the real iNat/PlantNet providers
 * (score_image has no localization — see inatMapping.ts), so `iconicTaxon` is
 * the real signal in production; the subjectBox path exists for providers
 * that DO localize (e.g. a future on-device detector, or Google Vision).
 */
export function qualifiesForMacroLens(
  recognition: Pick<RecognitionResult, 'iconicTaxon' | 'category' | 'subjectBox'>,
): boolean {
  if (recognition.iconicTaxon !== undefined && MACRO_ICONIC_TAXA.has(recognition.iconicTaxon)) {
    return true;
  }
  if (recognition.category === 'mushroom') return true;
  const box = recognition.subjectBox;
  if (box !== undefined && box.w * box.h <= MACRO_MAX_SUBJECT_AREA) return true;
  return false;
}
