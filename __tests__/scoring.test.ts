/**
 * Tests for the LifeDex scoring engine.
 *
 * All XP expectations are computed from the documented formula:
 *   base × confidenceMult × categoryMult × sensitivityMult
 *   × firstDiscoveryMult × streakMult
 *   (then quality gate, captive cap, duplicate penalty, round)
 *
 * Confidence multiplier formula: confidence × 0.5 + 0.5
 */

import { DefaultRarityScoringProvider, scoreSighting } from '@/domain/scoring';
import type { ScoreInput } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Minimal valid RecognitionResult. */
function makeRecognition(
  overrides: Partial<ScoreInput['recognition']> = {},
): ScoreInput['recognition'] {
  return {
    category: 'plant',
    commonName: 'Test Plant',
    confidence: 0.8,
    captiveStatus: 'wild',
    sensitivity: 'none',
    ...overrides,
  };
}

/** Minimal valid ScoreInput. Caller provides baseRarity separately. */
function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    recognition: makeRecognition(),
    confidence: 0.8,
    isDuplicate: false,
    captiveStatus: 'wild',
    sensitivity: 'none',
    qualityOk: true,
    isFirstDiscovery: false,
    streak: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

describe('scoreSighting', () => {
  // ── 1. Common domestic → low XP, capped ──────────────────────────
  it('gives low XP for a common domestic plant', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 0.7,
      captiveStatus: 'domestic',
      sensitivity: 'none',
    });
    // base(common)=10, confMult=0.7*0.5+0.5=0.85, cat=1.0, sens=1.0
    // xp = 10 * 0.85 = 8.5 → round=9; domestic cap: min(9,25)=9
    const result = scoreSighting(input, 'common');

    expect(result.rarity).toBe('common');
    expect(result.xp).toBe(9);
    expect(result.reason).toContain('domestic cap');
    expect(result.xp).toBeLessThanOrEqual(25);
  });

  // ── 2. Rare wild animal → high XP ────────────────────────────────
  it('gives high XP for a rare wild animal with good confidence', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 0.95,
      captiveStatus: 'wild',
      sensitivity: 'none',
    });
    // base(rare)=80, confMult=0.95*0.5+0.5=0.975, cat(animal)=1.1
    // xp = 80 * 0.975 * 1.1 = 85.8 → round=86
    const result = scoreSighting(input, 'rare');

    expect(result.rarity).toBe('rare');
    expect(result.xp).toBe(86);
    expect(result.xp).toBeGreaterThan(50);
  });

  // ── 3. Zoo / captive cap ─────────────────────────────────────────
  it('caps XP at 15 and forces rarity to common for zoo_captive', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 1.0,
      captiveStatus: 'zoo_captive',
      sensitivity: 'none',
    });
    // base(legendary)=500, confMult=1.0, cat=1.1 → 550 → zoo cap→15, common
    const result = scoreSighting(input, 'legendary');

    expect(result.rarity).toBe('common');
    expect(result.xp).toBe(15);
    expect(result.reason).toContain('zoo/captive cap');
  });

  it('caps XP at 25 for domestic captive status', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 1.0,
      captiveStatus: 'domestic',
      sensitivity: 'none',
    });
    // base(epic)=200, confMult=1.0, cat=1.1 → 220 → domestic cap→25
    const result = scoreSighting(input, 'epic');

    expect(result.xp).toBe(25);
    expect(result.reason).toContain('domestic cap');
  });

  // ── 4. Duplicate penalty ─────────────────────────────────────────
  it('applies 70% duplicate penalty and keeps rarity unchanged', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 1.0,
      isDuplicate: true,
      captiveStatus: 'wild',
    });
    // base(epic)=200, confMult=1.0, cat=1.1 → 220 → dup: 220*0.3=66
    const result = scoreSighting(input, 'epic');

    expect(result.rarity).toBe('epic');
    expect(result.xp).toBe(66);
    expect(result.reason).toContain('duplicate');
  });

  it('floors duplicate XP at 1 even for the lowest base', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 0.0, // confMult=0.5
      isDuplicate: true,
      captiveStatus: 'wild',
    });
    // base(common)=10, confMult=0.5, cat=1.0 → 5 → dup: 5*0.3=1.5 → round=2
    // (floor at 1 only when rounded xp < 1 — here 2 > 1 so no floor needed)
    const result = scoreSighting(input, 'common');
    expect(result.xp).toBeGreaterThanOrEqual(1);
  });

  // ── 5. First-discovery bonus ──────────────────────────────────────
  it('adds 50% XP bonus for first discovery', () => {
    const inputWithout = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 1.0,
      isFirstDiscovery: false,
    });
    const inputWith = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 1.0,
      isFirstDiscovery: true,
    });
    // base(uncommon)=30, confMult=1.0, cat=1.0 → 30; with bonus: 30*1.5=45
    const without = scoreSighting(inputWithout, 'uncommon');
    const withBonus = scoreSighting(inputWith, 'uncommon');

    expect(without.xp).toBe(30);
    expect(withBonus.xp).toBe(45);
    expect(withBonus.xp).toBe(Math.round(without.xp * 1.5));
    expect(withBonus.reason).toContain('first discovery');
  });

  // ── 6. Determinism ───────────────────────────────────────────────
  it('is fully deterministic — same input always yields identical output', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'mushroom' }),
      confidence: 0.77,
      isDuplicate: false,
      captiveStatus: 'wild',
      sensitivity: 'sensitive',
      qualityOk: true,
      isFirstDiscovery: true,
      streak: 10,
    });

    const r1 = scoreSighting(input, 'rare');
    const r2 = scoreSighting(input, 'rare');
    const r3 = scoreSighting({ ...input }, 'rare');

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  // ── 7. Protected sensitivity ──────────────────────────────────────
  it('applies 40% sensitivity bonus for protected species', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 0.9,
      sensitivity: 'protected',
      captiveStatus: 'wild',
    });
    // base(rare)=80, confMult=0.9*0.5+0.5=0.95, cat=1.1, sens=1.4
    // xp = 80 * 0.95 * 1.1 * 1.4 = 80 * 0.95 * 1.54 = 117.04 → 117
    const result = scoreSighting(input, 'rare');

    expect(result.xp).toBe(117);
    expect(result.reason).toContain('protected species');
  });

  it('applies 20% sensitivity bonus for sensitive species', () => {
    const inputNone = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 1.0,
      sensitivity: 'none',
      captiveStatus: 'wild',
    });
    const inputSensitive = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 1.0,
      sensitivity: 'sensitive',
      captiveStatus: 'wild',
    });
    const none = scoreSighting(inputNone, 'rare');
    const sensitive = scoreSighting(inputSensitive, 'rare');

    // base(rare)=80, confMult=1.0, cat=1.1 → 88; sensitive: 88*1.2=105.6→106
    expect(none.xp).toBe(88);
    expect(sensitive.xp).toBe(106);
  });

  // ── 8. Quality gate ──────────────────────────────────────────────
  it('halves XP and downgrades rarity one step on poor quality', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 1.0,
      qualityOk: false,
      sensitivity: 'none',
      captiveStatus: 'wild',
    });
    // base(rare)=80, confMult=1.0, cat=1.0 → 80 → quality: 80*0.5=40, rare→uncommon
    const result = scoreSighting(input, 'rare');

    expect(result.rarity).toBe('uncommon');
    expect(result.xp).toBe(40);
    expect(result.reason).toContain('poor quality');
  });

  it('does not downgrade below common on poor quality', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 1.0,
      qualityOk: false,
    });
    const result = scoreSighting(input, 'common');
    expect(result.rarity).toBe('common');
  });

  // ── 9. Streak multiplier ─────────────────────────────────────────
  it('adds 5% per 5-day streak step, capped at +25%', () => {
    const base = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 1.0,
    });
    // streak=0 → mult=1.0; streak=5 → +5%; streak=25+ → +25% (max)
    const r0 = scoreSighting({ ...base, streak: 0 }, 'common');
    const r5 = scoreSighting({ ...base, streak: 5 }, 'common');
    const r25 = scoreSighting({ ...base, streak: 25 }, 'common');
    const r30 = scoreSighting({ ...base, streak: 30 }, 'common');

    // base(common)=10, conf=1.0, cat=1.0 → 10
    expect(r0.xp).toBe(10);
    expect(r5.xp).toBe(11); // 10*1.05=10.5→11
    expect(r25.xp).toBe(13); // 10*1.25=12.5→13 (capped)
    expect(r30.xp).toBe(13); // same cap
  });

  // ── 10. Legendary wild → maximum XP ─────────────────────────────
  it('gives maximum XP for legendary wild animal with full confidence and first discovery', () => {
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 1.0,
      captiveStatus: 'wild',
      sensitivity: 'none',
      isFirstDiscovery: true,
      streak: 0,
    });
    // base(legendary)=500, confMult=1.0, cat=1.1, first×1.5
    // xp = 500 * 1.0 * 1.1 * 1.5 = 825
    const result = scoreSighting(input, 'legendary');

    expect(result.rarity).toBe('legendary');
    expect(result.xp).toBe(825);
  });

  // ── 11. XP is always a non-negative integer ──────────────────────
  it('always returns a non-negative integer XP', () => {
    const inputs: Array<[ScoreInput, 'common' | 'rare' | 'legendary']> = [
      [makeInput({ confidence: 0, isDuplicate: true, qualityOk: false }), 'common'],
      [makeInput({ confidence: 1, isFirstDiscovery: true, streak: 25 }), 'legendary'],
      [makeInput({ captiveStatus: 'zoo_captive', confidence: 0.5 }), 'legendary'],
    ];

    for (const [input, rarity] of inputs) {
      const result = scoreSighting(input, rarity);
      expect(Number.isInteger(result.xp)).toBe(true);
      expect(result.xp).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* DefaultRarityScoringProvider                                        */
/* ------------------------------------------------------------------ */

describe('DefaultRarityScoringProvider', () => {
  it('implements RarityScoringProvider interface and delegates to scoreSighting', () => {
    const provider = new DefaultRarityScoringProvider(() => 'rare');
    const input = makeInput({
      recognition: makeRecognition({ category: 'animal' }),
      confidence: 0.95,
    });
    const result = provider.score(input);

    // Same as scoreSighting(input, 'rare') from test #2
    expect(result.xp).toBe(86);
    expect(result.rarity).toBe('rare');
  });

  it('falls back to category-based rarity when no resolver is provided', () => {
    const provider = new DefaultRarityScoringProvider();
    const input = makeInput({
      recognition: makeRecognition({ category: 'plant' }),
      confidence: 0.5,
    });
    const result = provider.score(input);

    // Without resolver: plant+low confidence → common
    expect(result.rarity).toBe('common');
    expect(result.xp).toBeGreaterThan(0);
  });

  it('is deterministic through the provider interface', () => {
    const provider = new DefaultRarityScoringProvider(() => 'epic');
    const input = makeInput({ confidence: 0.88, streak: 10 });

    expect(provider.score(input)).toEqual(provider.score(input));
  });
});
