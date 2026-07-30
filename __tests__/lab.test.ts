/**
 * Tests for the Solo Lab domain module (src/domain/lab.ts) — pure, no I/O.
 */
import {
  LAB_TUNING,
  buildSample,
  canBuyGadget,
  canSubmitSample,
  isBonusFind,
  labFocusForWeek,
  qualifiesForMacroLens,
  rpForCatch,
  weekKeyOf,
} from '../src/domain/lab';
import { SPECIES_RULES } from '../src/domain/speciesRules';
import type { Sighting } from '../src/domain/types';

let seq = 0;

/** Builds a minimally-valid Sighting; only the fields lab.ts reads matter. */
function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    id: `s${seq}`,
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    category: 'animal',
    commonName: `Species ${seq}`,
    scientificName: undefined,
    confidence: 0.9,
    rarity: 'common',
    xp: 10,
    captiveStatus: 'wild',
    sensitivity: 'none',
    privatePhotoUri: 'file:///private/x.jpg',
    publicImageUri: 'mock-card://animal',
    publicLocation: { lat: 0, lng: 0, precisionMeters: 100, hidden: false },
    card: { name: `Species ${seq}`, category: 'animal', rarity: 'common', xp: 10, description: 'x', stats: {} },
    moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* isBonusFind                                                          */
/* ------------------------------------------------------------------ */

describe('isBonusFind', () => {
  it('is false for a curated SPECIES_RULES species matched by scientific name', () => {
    const robin = SPECIES_RULES.find((r) => r.commonName === 'European Robin');
    expect(robin).toBeDefined();
    expect(isBonusFind({ commonName: robin!.commonName, scientificName: robin!.scientificName })).toBe(
      false,
    );
  });

  it('is false for a curated species matched by common name alone', () => {
    expect(isBonusFind({ commonName: 'European Robin', scientificName: undefined })).toBe(false);
  });

  it('is true for a species with no catalogue entry at all', () => {
    expect(
      isBonusFind({ commonName: 'Definitely Not In The Catalogue', scientificName: 'Ficta inventa' }),
    ).toBe(true);
  });

  it('is true for real but uncurated species (e.g. Ghost Orchid — not in SPECIES_RULES)', () => {
    expect(SPECIES_RULES.some((r) => r.commonName === 'Ghost Orchid')).toBe(false);
    expect(isBonusFind({ commonName: 'Ghost Orchid', scientificName: 'Epipogium aphyllum' })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* canSubmitSample                                                      */
/* ------------------------------------------------------------------ */

describe('canSubmitSample', () => {
  const bonus = makeSighting({
    commonName: 'Ghost Orchid',
    scientificName: 'Epipogium aphyllum',
    category: 'plant',
    rarity: 'legendary',
  });
  const curated = makeSighting({ commonName: 'European Robin', scientificName: 'Erithacus rubecula' });

  it('rejects a curated (non-bonus) species — reason not-bonus', () => {
    expect(canSubmitSample(curated, [], 3)).toEqual({ ok: false, reason: 'not-bonus' });
  });

  it('rejects when this species is already sampled — reason already-sampled', () => {
    const existing = buildSample(bonus, '2026-01-01T00:00:00.000Z');
    expect(canSubmitSample(bonus, [existing], 3)).toEqual({ ok: false, reason: 'already-sampled' });
  });

  it('rejects when there are no vials — reason no-vials', () => {
    expect(canSubmitSample(bonus, [], 0)).toEqual({ ok: false, reason: 'no-vials' });
  });

  it('allows a bonus find, not yet sampled, with a vial available', () => {
    expect(canSubmitSample(bonus, [], 1)).toEqual({ ok: true });
  });

  it('a DIFFERENT bonus species does not block submission (per-species dedup, not global)', () => {
    const existing = buildSample(bonus, '2026-01-01T00:00:00.000Z');
    const otherBonus = makeSighting({ commonName: 'Wood Anemone', scientificName: 'Anemonoides nemorosa' });
    expect(SPECIES_RULES.some((r) => r.commonName === 'Wood Anemone')).toBe(false);
    expect(canSubmitSample(otherBonus, [existing], 3)).toEqual({ ok: true });
  });

  it('not-bonus wins over no-vials when both would apply', () => {
    expect(canSubmitSample(curated, [], 0)).toEqual({ ok: false, reason: 'not-bonus' });
  });
});

/* ------------------------------------------------------------------ */
/* buildSample                                                          */
/* ------------------------------------------------------------------ */

describe('buildSample', () => {
  it('builds a LabSample carrying the sighting identity + rarity intel', () => {
    const sighting = makeSighting({
      id: 'sight-1',
      commonName: 'Ghost Orchid',
      scientificName: 'Epipogium aphyllum',
      category: 'plant',
      rarity: 'legendary',
      observationsCount: 850,
    });
    const sample = buildSample(sighting, '2026-03-01T00:00:00.000Z');
    expect(sample).toEqual({
      sightingId: 'sight-1',
      speciesKey: 'epipogium aphyllum',
      commonName: 'Ghost Orchid',
      scientificName: 'Epipogium aphyllum',
      category: 'plant',
      rarity: 'legendary',
      observationsCount: 850,
      submittedAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('speciesKey falls back to commonName when scientificName is absent', () => {
    const sighting = makeSighting({ commonName: 'Mystery Bug', scientificName: undefined });
    expect(buildSample(sighting, '2026-01-01T00:00:00.000Z').speciesKey).toBe('mystery bug');
  });
});

/* ------------------------------------------------------------------ */
/* rpForCatch                                                           */
/* ------------------------------------------------------------------ */

describe('rpForCatch', () => {
  it('matches rpByRarity with no multipliers', () => {
    expect(rpForCatch('common', false, false)).toBe(LAB_TUNING.rpByRarity.common);
    expect(rpForCatch('uncommon', false, false)).toBe(LAB_TUNING.rpByRarity.uncommon);
    expect(rpForCatch('rare', false, false)).toBe(LAB_TUNING.rpByRarity.rare);
    expect(rpForCatch('epic', false, false)).toBe(LAB_TUNING.rpByRarity.epic);
    expect(rpForCatch('legendary', false, false)).toBe(LAB_TUNING.rpByRarity.legendary);
  });

  it('applies the first-discovery multiplier alone', () => {
    expect(rpForCatch('rare', true, false)).toBe(
      LAB_TUNING.rpByRarity.rare * LAB_TUNING.firstDiscoveryRpMultiplier,
    );
  });

  it('applies the focus multiplier alone', () => {
    expect(rpForCatch('rare', false, true)).toBe(LAB_TUNING.rpByRarity.rare * LAB_TUNING.focusRpMultiplier);
  });

  it('stacks BOTH multipliers multiplicatively', () => {
    expect(rpForCatch('epic', true, true)).toBe(
      LAB_TUNING.rpByRarity.epic * LAB_TUNING.firstDiscoveryRpMultiplier * LAB_TUNING.focusRpMultiplier,
    );
  });

  it('always returns a non-negative integer across the full matrix', () => {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
    for (const rarity of rarities) {
      for (const first of [false, true]) {
        for (const focus of [false, true]) {
          const rp = rpForCatch(rarity, first, focus);
          expect(Number.isInteger(rp)).toBe(true);
          expect(rp).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* canBuyGadget                                                         */
/* ------------------------------------------------------------------ */

describe('canBuyGadget', () => {
  it('rejects when already owned, regardless of level/rp — reason owned', () => {
    expect(canBuyGadget('labor-pass', 99, 9_999, ['labor-pass'])).toEqual({
      ok: false,
      reason: 'owned',
    });
  });

  it('rejects below the level requirement — reason level', () => {
    const { minLevel } = LAB_TUNING.gadgets['labor-pass'];
    expect(canBuyGadget('labor-pass', minLevel - 1, 9_999, [])).toEqual({
      ok: false,
      reason: 'level',
    });
  });

  it('rejects with insufficient rp once the level requirement is met — reason rp', () => {
    const { minLevel, priceRp } = LAB_TUNING.gadgets['labor-pass'];
    expect(canBuyGadget('labor-pass', minLevel, priceRp - 1, [])).toEqual({
      ok: false,
      reason: 'rp',
    });
  });

  it('allows the purchase once level + rp are both sufficient', () => {
    const { minLevel, priceRp } = LAB_TUNING.gadgets['labor-pass'];
    expect(canBuyGadget('labor-pass', minLevel, priceRp, [])).toEqual({ ok: true });
  });

  it('gates makro-linse independently (its own level/price)', () => {
    const { minLevel, priceRp } = LAB_TUNING.gadgets['makro-linse'];
    expect(canBuyGadget('makro-linse', minLevel - 1, 9_999, [])).toEqual({
      ok: false,
      reason: 'level',
    });
    expect(canBuyGadget('makro-linse', minLevel, priceRp, [])).toEqual({ ok: true });
  });

  it('owning ONE gadget does not block buying the other', () => {
    const { minLevel, priceRp } = LAB_TUNING.gadgets['makro-linse'];
    expect(canBuyGadget('makro-linse', minLevel, priceRp, ['labor-pass'])).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* weekKeyOf                                                            */
/* ------------------------------------------------------------------ */

describe('weekKeyOf', () => {
  it('is deterministic for timestamps within the same ISO (Mon-Sun) week', () => {
    // 2026-03-16 is a Monday; 2026-03-20 is the Friday of the same ISO week.
    expect(weekKeyOf('2026-03-16T00:00:00.000Z')).toBe(weekKeyOf('2026-03-20T23:59:59.000Z'));
  });

  it('differs across an ISO week (Mon) boundary', () => {
    // 2026-03-15 is a Sunday (end of the prior ISO week); 2026-03-16 is the next Monday.
    expect(weekKeyOf('2026-03-15T23:59:59.000Z')).not.toBe(weekKeyOf('2026-03-16T00:00:00.000Z'));
  });

  it('never throws, even on unparseable input', () => {
    expect(() => weekKeyOf('not-a-date')).not.toThrow();
  });

  it('returns a YYYY-Www shaped key', () => {
    expect(weekKeyOf('2026-06-01T12:00:00.000Z')).toMatch(/^\d{4}-W\d{2}$/);
  });
});

/* ------------------------------------------------------------------ */
/* labFocusForWeek                                                      */
/* ------------------------------------------------------------------ */

describe('labFocusForWeek', () => {
  const CORE = new Set(['animal', 'plant', 'tree', 'mushroom']);

  it('is deterministic for the same weekKey', () => {
    const key = weekKeyOf('2026-06-01T12:00:00.000Z');
    expect(labFocusForWeek(key)).toBe(labFocusForWeek(key));
  });

  it('always returns one of the four core categories', () => {
    for (let w = 1; w <= 20; w++) {
      const key = `2026-W${String(w).padStart(2, '0')}`;
      expect(CORE.has(labFocusForWeek(key))).toBe(true);
    }
  });

  it('varies across different weeks (not always the same category)', () => {
    const picks = new Set<string>();
    for (let w = 1; w <= 20; w++) {
      picks.add(labFocusForWeek(`2026-W${String(w).padStart(2, '0')}`));
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ */
/* qualifiesForMacroLens                                                */
/* ------------------------------------------------------------------ */

describe('qualifiesForMacroLens', () => {
  it('is true for each macro iconic taxon', () => {
    for (const iconicTaxon of ['Insecta', 'Arachnida', 'Mollusca'] as const) {
      expect(
        qualifiesForMacroLens({ iconicTaxon, category: 'animal', subjectBox: undefined }),
      ).toBe(true);
    }
  });

  it('is true for category mushroom regardless of iconicTaxon', () => {
    expect(
      qualifiesForMacroLens({ iconicTaxon: undefined, category: 'mushroom', subjectBox: undefined }),
    ).toBe(true);
  });

  it('is true for a small subject box (area <= 0.18)', () => {
    expect(
      qualifiesForMacroLens({
        iconicTaxon: undefined,
        category: 'animal',
        subjectBox: { x: 0.4, y: 0.4, w: 0.3, h: 0.3 }, // area 0.09
      }),
    ).toBe(true);
  });

  it('treats the area boundary inclusively (exactly 0.18 qualifies)', () => {
    expect(
      qualifiesForMacroLens({
        iconicTaxon: undefined,
        category: 'animal',
        subjectBox: { x: 0, y: 0, w: 0.6, h: 0.3 }, // area exactly 0.18
      }),
    ).toBe(true);
  });

  it('is false for a large subject box (area > 0.18)', () => {
    expect(
      qualifiesForMacroLens({
        iconicTaxon: undefined,
        category: 'animal',
        subjectBox: { x: 0, y: 0, w: 0.6, h: 0.6 }, // area 0.36
      }),
    ).toBe(false);
  });

  it('is false for a non-macro iconic taxon, non-mushroom category, no subject box', () => {
    expect(
      qualifiesForMacroLens({ iconicTaxon: 'Aves', category: 'animal', subjectBox: undefined }),
    ).toBe(false);
  });

  it('is false when everything is undefined/absent (never crashes on missing data)', () => {
    expect(
      qualifiesForMacroLens({ iconicTaxon: undefined, category: 'plant', subjectBox: undefined }),
    ).toBe(false);
  });
});
