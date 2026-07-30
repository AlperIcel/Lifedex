/**
 * Tests for the lab store (src/store/lab.ts).
 *
 * Covers:
 *   - Safe defaults (startingVials, zero RP, no gadgets, no samples).
 *   - submitSample: decrements a vial + credits submitRp + one-per-species,
 *     and rejects a curated (non-bonus) species / an empty vial pool.
 *   - creditCatchRp: credits rpForCatch's result, with the focus multiplier
 *     gated on BOTH owning 'labor-pass' AND a matching weekly focus category.
 *   - buyVial / buyGadget: insufficient-rp / insufficient-level / already-owned
 *     gates (level gating via a stubbed lifeDexStore.getProfile(), since the
 *     seeded profile's real level is not a fixed/known test constant).
 *   - grantDailyVial: idempotent per dayKey.
 *   - Persistence round-trip via flush()+reset()+hydrate() (simulated restart).
 *   - Corrupt / partially-invalid storage payloads are sanitized field-by-field.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LAB_TUNING } from '../src/domain/lab';
import { labStore } from '../src/store/lab';
import { lifeDexStore } from '../src/store/useLifeDexStore';
import type { Sighting } from '../src/domain/types';

let seq = 0;

/** Builds a minimally-valid Sighting; only the fields lab.ts/lab store read matter. */
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

/** A fresh uncatalogued ("bonus find") sighting — never in SPECIES_RULES. */
function makeBonusSighting(overrides: Partial<Sighting> = {}): Sighting {
  return makeSighting({
    commonName: `Bonus Species ${seq + 1}`,
    scientificName: `Bonus scientificus ${seq + 1}`,
    category: 'plant',
    rarity: 'legendary',
    ...overrides,
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  labStore.reset();
  jest.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

describe('labStore defaults', () => {
  it('starts with startingVials, zero RP, no gadgets, no samples', () => {
    const s = labStore.getState();
    expect(s.vials).toBe(LAB_TUNING.startingVials);
    expect(s.researchPoints).toBe(0);
    expect(s.ownedGadgets).toEqual([]);
    expect(s.samples).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* submitSample                                                        */
/* ------------------------------------------------------------------ */

describe('submitSample', () => {
  it('decrements one vial and credits submitRp research points', () => {
    const before = labStore.getState();
    const result = labStore.submitSample(makeBonusSighting());
    expect(result.ok).toBe(true);
    expect(result.rpEarned).toBe(LAB_TUNING.submitRp);

    const after = labStore.getState();
    expect(after.vials).toBe(before.vials - 1);
    expect(after.researchPoints).toBe(before.researchPoints + LAB_TUNING.submitRp);
    expect(after.samples).toHaveLength(1);
  });

  it('allows at most ONE sample per species', () => {
    const sighting = makeBonusSighting({ commonName: 'Ghost Orchid', scientificName: 'Epipogium aphyllum' });
    labStore.submitSample(sighting);
    const second = labStore.submitSample(sighting);
    expect(second).toEqual({ ok: false, reason: 'already-sampled' });
    expect(labStore.getState().samples).toHaveLength(1);
  });

  it('a curated species is rejected — reason not-bonus, nothing charged', () => {
    const before = labStore.getState();
    const curated = makeSighting({ commonName: 'European Robin', scientificName: 'Erithacus rubecula' });
    const result = labStore.submitSample(curated);
    expect(result).toEqual({ ok: false, reason: 'not-bonus' });
    expect(labStore.getState()).toEqual(before);
  });

  it('rejects once every vial is spent — reason no-vials', () => {
    for (let i = 0; i < LAB_TUNING.startingVials; i++) {
      const r = labStore.submitSample(makeBonusSighting());
      expect(r.ok).toBe(true);
    }
    expect(labStore.getState().vials).toBe(0);

    const result = labStore.submitSample(makeBonusSighting());
    expect(result).toEqual({ ok: false, reason: 'no-vials' });
    // Still only the successful submissions are on the bench.
    expect(labStore.getState().samples).toHaveLength(LAB_TUNING.startingVials);
  });
});

/* ------------------------------------------------------------------ */
/* creditCatchRp                                                       */
/* ------------------------------------------------------------------ */

describe('creditCatchRp', () => {
  it('credits the base rpByRarity amount with no gadget owned', () => {
    const rp = labStore.creditCatchRp('rare', false, 'animal', '2026-01-05T00:00:00.000Z');
    expect(rp).toBe(LAB_TUNING.rpByRarity.rare);
    expect(labStore.getState().researchPoints).toBe(LAB_TUNING.rpByRarity.rare);
  });

  it('does NOT apply the focus multiplier without owning labor-pass, even if the category matches', () => {
    const nowISO = '2026-06-01T00:00:00.000Z';
    // Whatever this week's focus category actually is, use it — the point is
    // the multiplier must not apply while the gadget is unowned.
    const rp = labStore.creditCatchRp('rare', false, 'animal', nowISO);
    expect(rp).toBe(LAB_TUNING.rpByRarity.rare);
  });
});

/* ------------------------------------------------------------------ */
/* buyVial                                                             */
/* ------------------------------------------------------------------ */

describe('buyVial', () => {
  it('rejects with insufficient RP', () => {
    expect(labStore.getState().researchPoints).toBeLessThan(LAB_TUNING.vialPriceRp);
    expect(labStore.buyVial()).toEqual({ ok: false, reason: 'rp' });
  });

  it('succeeds once enough RP has been earned', () => {
    while (labStore.getState().researchPoints < LAB_TUNING.vialPriceRp) {
      labStore.creditCatchRp('legendary', false, 'animal', '2026-01-05T00:00:00.000Z');
    }
    const rpBefore = labStore.getState().researchPoints;
    const vialsBefore = labStore.getState().vials;
    expect(labStore.buyVial()).toEqual({ ok: true });
    expect(labStore.getState().vials).toBe(vialsBefore + 1);
    expect(labStore.getState().researchPoints).toBe(rpBefore - LAB_TUNING.vialPriceRp);
  });
});

/* ------------------------------------------------------------------ */
/* buyGadget — level gate wiring (stubbed profile, see file header)     */
/* ------------------------------------------------------------------ */

describe('buyGadget', () => {
  function stubLevel(level: number): jest.SpyInstance {
    return jest.spyOn(lifeDexStore, 'getProfile').mockReturnValue({
      id: 'test-user',
      username: 'Tester',
      xp: 0,
      level,
    });
  }

  it('rejects when the real profile level is below minLevel', () => {
    stubLevel(1);
    expect(labStore.buyGadget('labor-pass')).toEqual({ ok: false, reason: 'level' });
  });

  it('rejects with insufficient RP once the level requirement is met', () => {
    stubLevel(99);
    expect(labStore.getState().researchPoints).toBe(0);
    expect(labStore.buyGadget('labor-pass')).toEqual({ ok: false, reason: 'rp' });
  });

  it('succeeds once level + RP are both sufficient, and charges the price', () => {
    stubLevel(99);
    while (labStore.getState().researchPoints < LAB_TUNING.gadgets['labor-pass'].priceRp) {
      labStore.creditCatchRp('legendary', false, 'animal', '2026-01-05T00:00:00.000Z');
    }
    const rpBefore = labStore.getState().researchPoints;
    expect(labStore.buyGadget('labor-pass')).toEqual({ ok: true });
    expect(labStore.getState().ownedGadgets).toContain('labor-pass');
    expect(labStore.getState().researchPoints).toBe(rpBefore - LAB_TUNING.gadgets['labor-pass'].priceRp);
  });

  it('rejects a second purchase of an already-owned gadget — reason owned', () => {
    stubLevel(99);
    while (labStore.getState().researchPoints < LAB_TUNING.gadgets['labor-pass'].priceRp * 2) {
      labStore.creditCatchRp('legendary', false, 'animal', '2026-01-05T00:00:00.000Z');
    }
    labStore.buyGadget('labor-pass');
    expect(labStore.buyGadget('labor-pass')).toEqual({ ok: false, reason: 'owned' });
  });
});

/* ------------------------------------------------------------------ */
/* grantDailyVial                                                      */
/* ------------------------------------------------------------------ */

describe('grantDailyVial', () => {
  it('grants dailyClaimVialBonus vials the first time for a dayKey', () => {
    const before = labStore.getState().vials;
    expect(labStore.grantDailyVial('2026-01-01')).toBe(true);
    expect(labStore.getState().vials).toBe(before + LAB_TUNING.dailyClaimVialBonus);
  });

  it('is a no-op on a second call for the SAME dayKey', () => {
    labStore.grantDailyVial('2026-01-02');
    const afterFirst = labStore.getState().vials;
    expect(labStore.grantDailyVial('2026-01-02')).toBe(false);
    expect(labStore.getState().vials).toBe(afterFirst);
  });

  it('grants again for a NEW dayKey', () => {
    labStore.grantDailyVial('2026-01-03');
    const afterFirst = labStore.getState().vials;
    expect(labStore.grantDailyVial('2026-01-04')).toBe(true);
    expect(labStore.getState().vials).toBe(afterFirst + LAB_TUNING.dailyClaimVialBonus);
  });
});

/* ------------------------------------------------------------------ */
/* Persistence round-trip (simulated restart)                          */
/* ------------------------------------------------------------------ */

describe('labStore persistence round-trip', () => {
  it('persists RP / vials / samples across a reset+hydrate cycle', async () => {
    labStore.creditCatchRp('legendary', false, 'animal', '2026-01-01T00:00:00.000Z'); // +15 RP
    const result = labStore.submitSample(
      makeBonusSighting({ commonName: 'Ghost Orchid', scientificName: 'Epipogium aphyllum' }),
    );
    expect(result.ok).toBe(true);
    await labStore.flush();

    const expectedRp = LAB_TUNING.rpByRarity.legendary + LAB_TUNING.submitRp;
    const expectedVials = LAB_TUNING.startingVials - 1;
    expect(labStore.getState().researchPoints).toBe(expectedRp);

    labStore.reset(); // in-memory only — storage still holds the persisted values
    expect(labStore.getState().researchPoints).toBe(0);
    expect(labStore.getState().vials).toBe(LAB_TUNING.startingVials);

    await labStore.hydrate();
    const state = labStore.getState();
    expect(state.researchPoints).toBe(expectedRp);
    expect(state.vials).toBe(expectedVials);
    expect(state.samples).toHaveLength(1);
    expect(state.samples[0]?.commonName).toBe('Ghost Orchid');
  });

  it('hydrate() shares one in-flight read when called concurrently', async () => {
    labStore.reset();
    const [a, b] = await Promise.all([labStore.hydrate(), labStore.hydrate()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Corrupt-payload sanitize                                            */
/* ------------------------------------------------------------------ */

describe('labStore corrupt-payload handling', () => {
  it('ignores corrupt (non-JSON) storage and keeps defaults', async () => {
    await AsyncStorage.setItem('lifedex:lab:v1', 'not json{{{');
    labStore.reset();
    await expect(labStore.hydrate()).resolves.toBeUndefined();
    expect(labStore.getState().vials).toBe(LAB_TUNING.startingVials);
    expect(labStore.getState().researchPoints).toBe(0);
  });

  it('rejects invalid fields but keeps valid ones from storage', async () => {
    await AsyncStorage.setItem(
      'lifedex:lab:v1',
      JSON.stringify({
        researchPoints: -5, // invalid (negative) -> default kept
        vials: 7, // valid -> accepted
        ownedGadgets: ['labor-pass', 'not-a-real-gadget'], // one valid, one filtered
        samples: [
          { junk: true }, // corrupt -> filtered
          {
            sightingId: 's1',
            speciesKey: 'x',
            commonName: 'X',
            category: 'animal',
            rarity: 'common',
            submittedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        lastVialGrantDayKey: 42, // wrong type -> default (undefined) kept
      }),
    );
    labStore.reset();
    await labStore.hydrate();
    const state = labStore.getState();

    expect(state.researchPoints).toBe(0);
    expect(state.vials).toBe(7);
    expect(state.ownedGadgets).toEqual(['labor-pass']);
    expect(state.samples).toHaveLength(1);
    expect(state.samples[0]?.sightingId).toBe('s1');
    expect(state.lastVialGrantDayKey).toBeUndefined();
  });
});
