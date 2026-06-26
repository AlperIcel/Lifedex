/**
 * LifeDex scoring engine — deterministic XP + rarity calculation.
 *
 * Rules (in application order):
 * 1. Base XP from rarity tier of the recognised species.
 * 2. Confidence multiplier (linear, 0.5–1.0 mapped to 0.5×–1.0×).
 * 3. Category multiplier (mushrooms rare → 1.2×, animals → 1.1×, default 1.0×).
 * 4. Sensitivity bonus (sensitive +20 %, protected +40 %).
 * 5. First-discovery bonus (+50 % on top of everything so far).
 * 6. Streak multiplier (every 5-day streak step adds 5 %, capped at +25 %).
 * 7. Image quality gate: poor quality → halve XP, override rarity down one tier.
 * 8. Captive/zoo cap: zoo_captive → cap at 15 XP and force rarity = 'common'.
 *    domestic → cap at 25 XP.
 * 9. Duplicate penalty: −70 % XP, floor at 1. Rarity is NOT changed.
 * 10. Final XP is rounded to nearest integer and clamped to [0, ∞).
 *
 * No rarity up-/down-grades happen after the quality gate — the rarity returned
 * reflects the actual species tier, not an ephemeral capture quality.
 *
 * NOTE on rarity source: `ScoreInput.recognition` (RecognitionResult) does not
 * carry a rarity field — rarity is determined by SpeciesRule lookup in the
 * pipeline before scoring. The pipeline should derive `baseRarity` from the
 * matched SpeciesRule and pass it via `ScoreInput`'s `recognition.sensitivity`
 * + category. Since ScoreInput has no explicit rarity field, this engine
 * derives a *default* rarity from confidence + category as a sensible fallback
 * when no SpeciesRule is matched. Callers that do have a SpeciesRule should
 * pass `baseRarity` as the optional second argument to `scoreSighting`.
 */

import type { RarityScoringProvider } from '../providers/interfaces';
import type { Category, Rarity, ScoreInput, ScoreResult } from './types';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Base XP for each rarity tier. */
const BASE_XP: Record<Rarity, number> = {
  common: 10,
  uncommon: 30,
  rare: 80,
  epic: 200,
  legendary: 500,
};

/** Ordered rarity tiers (ascending) — used for downgrade logic. */
const RARITY_ORDER: Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/**
 * Default rarity when no SpeciesRule is available, derived from category.
 * Animals & mushrooms skew rarer by default; plants & trees are common.
 * Confidence threshold nudges the tier up one step.
 */
const DEFAULT_RARITY_BY_CATEGORY: Record<Category, Rarity> = {
  animal: 'uncommon',
  mushroom: 'uncommon',
  plant: 'common',
  tree: 'common',
  unknown: 'common',
};

function defaultRarityFromRecognition(
  category: Category,
  confidence: number,
): Rarity {
  // Complete Record<Category,Rarity> — fallback to 'common' for noUncheckedIndexedAccess.
  const base: Rarity = DEFAULT_RARITY_BY_CATEGORY[category] ?? 'common';
  const baseIdx = RARITY_ORDER.indexOf(base);
  // High confidence (≥0.85) nudges one tier up, max 'rare'
  const bump = confidence >= 0.85 ? 1 : 0;
  const idx = Math.min(baseIdx + bump, RARITY_ORDER.indexOf('rare'));
  // RARITY_ORDER is a fixed-length array; idx is always in bounds.
  return RARITY_ORDER[idx] ?? base;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function downgradeRarity(r: Rarity): Rarity {
  const idx = RARITY_ORDER.indexOf(r);
  // idx 0 stays at 'common'
  const newIdx = Math.max(0, idx - 1);
  const result = RARITY_ORDER[newIdx];
  // newIdx is always in [0, RARITY_ORDER.length-1] so result is defined
  return result ?? 'common';
}

/* ------------------------------------------------------------------ */
/* Core function                                                       */
/* ------------------------------------------------------------------ */

/**
 * Deterministic scoring function. Given the same input it always returns the
 * same XP and rarity — no randomness, no side effects.
 *
 * `baseRarity` — the species-level rarity from a SpeciesRule lookup. When
 * omitted the engine falls back to deriving it from category + confidence.
 */
export function scoreSighting(
  input: ScoreInput,
  baseRarity?: Rarity,
): ScoreResult {
  const {
    recognition,
    confidence,
    isDuplicate,
    captiveStatus,
    sensitivity,
    qualityOk,
    isFirstDiscovery,
    streak,
  } = input;

  const speciesRarity: Rarity =
    baseRarity ??
    defaultRarityFromRecognition(recognition.category, confidence);

  // Effective rarity used for XP base (may be overridden for captive/quality).
  let effectiveRarity: Rarity = speciesRarity;

  // ── 1. Base XP ────────────────────────────────────────────────────
  // BASE_XP is a complete Record<Rarity,number>; the non-null assertion is safe.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let xp: number = BASE_XP[effectiveRarity]!;

  // ── 2. Confidence multiplier (0.5 → 0.5×, 1.0 → 1.0×, linear) ──
  const confidenceMult = clamp(confidence, 0, 1) * 0.5 + 0.5;
  xp *= confidenceMult;

  // ── 3. Category multiplier ─────────────────────────────────────────
  const categoryMult =
    recognition.category === 'mushroom'
      ? 1.2
      : recognition.category === 'animal'
        ? 1.1
        : 1.0;
  xp *= categoryMult;

  // ── 4. Sensitivity bonus ──────────────────────────────────────────
  const sensitivityMult =
    sensitivity === 'protected'
      ? 1.4
      : sensitivity === 'sensitive'
        ? 1.2
        : 1.0;
  xp *= sensitivityMult;

  // ── 5. First-discovery bonus (+50 %) ─────────────────────────────
  if (isFirstDiscovery) {
    xp *= 1.5;
  }

  // ── 6. Streak multiplier (max +25 %, step per 5 days) ────────────
  const streakSteps = Math.floor(streak / 5);
  const streakMult = 1 + clamp(streakSteps * 0.05, 0, 0.25);
  xp *= streakMult;

  // ── 7. Image quality gate ─────────────────────────────────────────
  if (!qualityOk) {
    xp *= 0.5;
    effectiveRarity = downgradeRarity(effectiveRarity);
  }

  // ── 8. Captive / zoo cap ─────────────────────────────────────────
  if (captiveStatus === 'zoo_captive') {
    xp = Math.min(xp, 15);
    effectiveRarity = 'common';
  } else if (captiveStatus === 'domestic') {
    xp = Math.min(xp, 25);
    // Rarity stays but cap XP so domestic cats/dogs aren't worth more than that.
  }

  // ── 9. Duplicate penalty (−70 %, floor 1) ────────────────────────
  if (isDuplicate) {
    xp *= 0.3;
    xp = Math.max(xp, 1);
  }

  // ── 10. Round + floor at 0 ───────────────────────────────────────
  xp = Math.max(0, Math.round(xp));

  // ── Reason string ─────────────────────────────────────────────────
  const reasons: string[] = [];
  reasons.push(`${effectiveRarity} ${recognition.category}`);
  if (!qualityOk) reasons.push('poor quality');
  if (captiveStatus === 'zoo_captive') reasons.push('zoo/captive cap');
  if (captiveStatus === 'domestic') reasons.push('domestic cap');
  if (sensitivity === 'sensitive' || sensitivity === 'protected')
    reasons.push(`${sensitivity} species`);
  if (isFirstDiscovery) reasons.push('first discovery');
  if (streak > 0) reasons.push(`streak ×${streak}`);
  if (isDuplicate) reasons.push('duplicate −70 %');

  return {
    xp,
    rarity: effectiveRarity,
    reason: reasons.join(', '),
  };
}

/* ------------------------------------------------------------------ */
/* RarityScoringProvider implementation                                */
/* ------------------------------------------------------------------ */

/**
 * Wraps `scoreSighting` behind the `RarityScoringProvider` interface so it can
 * be injected anywhere the provider contract is expected.
 *
 * Optionally constructed with a species-rule resolver so the provider can look
 * up `baseRarity` before delegating to `scoreSighting`. The resolver is a
 * simple sync callback — the pipeline owns the SpeciesRule table.
 */
export class DefaultRarityScoringProvider implements RarityScoringProvider {
  private readonly resolveRarity: (input: ScoreInput) => Rarity | undefined;

  constructor(resolveRarity?: (input: ScoreInput) => Rarity | undefined) {
    this.resolveRarity = resolveRarity ?? (() => undefined);
  }

  score(input: ScoreInput): ScoreResult {
    const baseRarity = this.resolveRarity(input);
    return scoreSighting(input, baseRarity);
  }
}
