/**
 * Tests for the observation-frequency rarity curve (src/domain/observationRarity.ts).
 *
 * Pure maths — no network, no fixtures beyond plain numbers. Every threshold is
 * checked ON the boundary and one below it, because the boundaries ARE the game
 * economy: an off-by-one here silently shifts what counts as legendary.
 */
import {
  OBSERVATION_RARITY_THRESHOLDS as T,
  isObservationCount,
  rarityFromObservationCount,
  rarityFromObservations,
} from '@/domain/observationRarity';
import { RaritySchema } from '@/domain/types';

describe('rarityFromObservations — the curve', () => {
  it('maps a very widely observed species to common', () => {
    expect(rarityFromObservations(2_000_000)).toBe('common');
    expect(rarityFromObservations(620_000)).toBe('common'); // dandelion
  });

  it('maps a frequently observed species to uncommon', () => {
    expect(rarityFromObservations(155_000)).toBe('uncommon'); // English oak
  });

  it('maps a moderately observed species to rare', () => {
    expect(rarityFromObservations(42_000)).toBe('rare'); // chanterelle
  });

  it('maps a seldom observed species to epic', () => {
    expect(rarityFromObservations(5_400)).toBe('epic'); // eagle owl
  });

  it('maps a barely observed species to legendary', () => {
    expect(rarityFromObservations(850)).toBe('legendary'); // ghost orchid
    expect(rarityFromObservations(0)).toBe('legendary');
  });
});

describe('rarityFromObservations — boundaries are inclusive lower bounds', () => {
  it.each([
    [T.common, 'common', 'uncommon'],
    [T.uncommon, 'uncommon', 'rare'],
    [T.rare, 'rare', 'epic'],
    [T.epic, 'epic', 'legendary'],
  ] as const)(
    'exactly %i is %s, one below is %s',
    (threshold, atBound, belowBound) => {
      expect(rarityFromObservations(threshold)).toBe(atBound);
      expect(rarityFromObservations(threshold - 1)).toBe(belowBound);
    },
  );

  it('has strictly descending thresholds (a tier can never be unreachable)', () => {
    expect(T.common).toBeGreaterThan(T.uncommon);
    expect(T.uncommon).toBeGreaterThan(T.rare);
    expect(T.rare).toBeGreaterThan(T.epic);
    expect(T.epic).toBeGreaterThan(0);
  });

  it('only ever returns a valid Rarity', () => {
    for (const n of [0, 1, T.epic, T.rare, T.uncommon, T.common, 9_999_999]) {
      expect(() => RaritySchema.parse(rarityFromObservations(n))).not.toThrow();
    }
  });
});

describe('rarityFromObservations — malformed input never mints a legendary', () => {
  it.each([NaN, Infinity, -Infinity, -1, -500_000])(
    'treats %p as no signal and returns the floor tier',
    (bad) => {
      expect(rarityFromObservations(bad)).toBe('common');
    },
  );
});

describe('isObservationCount', () => {
  it('accepts finite non-negative numbers including zero', () => {
    expect(isObservationCount(0)).toBe(true);
    expect(isObservationCount(12_345)).toBe(true);
  });
  it('rejects undefined, negatives and non-finite values', () => {
    expect(isObservationCount(undefined)).toBe(false);
    expect(isObservationCount(-1)).toBe(false);
    expect(isObservationCount(NaN)).toBe(false);
    expect(isObservationCount(Infinity)).toBe(false);
  });
});

describe('rarityFromObservationCount — the guarded entry point', () => {
  it('returns a tier for a usable count', () => {
    expect(rarityFromObservationCount(850)).toBe('legendary');
    expect(rarityFromObservationCount(0)).toBe('legendary');
  });

  it('returns undefined (not a tier) when there is no usable signal', () => {
    expect(rarityFromObservationCount(undefined)).toBeUndefined();
    expect(rarityFromObservationCount(NaN)).toBeUndefined();
    expect(rarityFromObservationCount(-1)).toBeUndefined();
  });
});
