/**
 * Tests for pickBest — the iNat-base vs. flora-refiner routing. Pure, no network.
 * Exercises every branch.
 */
import type { Category, RecognitionResult } from '@/domain/types';
import { pickBest } from '../inatRouting';

function result(
  category: Category,
  confidence: number,
  commonName = 'X',
): RecognitionResult {
  return { category, commonName, confidence, captiveStatus: 'wild', sensitivity: 'none' };
}

describe('pickBest', () => {
  it('returns flora when base is plant and flora is a more confident real ID', () => {
    const base = result('plant', 0.5, 'iNat plant');
    const flora = result('plant', 0.8, 'PlantNet plant');
    expect(pickBest(base, flora)).toBe(flora);
  });

  it('returns flora for base=tree (tree counts as flora)', () => {
    const base = result('tree', 0.4, 'iNat tree');
    const flora = result('tree', 0.7, 'PlantNet tree');
    expect(pickBest(base, flora)).toBe(flora);
  });

  it('returns flora for base=mushroom', () => {
    const base = result('mushroom', 0.3);
    const flora = result('mushroom', 0.6);
    expect(pickBest(base, flora)).toBe(flora);
  });

  it('keeps base when base is an animal (refiner irrelevant), even if flora more confident', () => {
    const base = result('animal', 0.5, 'iNat animal');
    const flora = result('plant', 0.99, 'PlantNet');
    expect(pickBest(base, flora)).toBe(base);
  });

  it('keeps base when flora is undefined', () => {
    const base = result('plant', 0.5);
    expect(pickBest(base, undefined)).toBe(base);
  });

  it("keeps base when flora couldn't identify (category unknown)", () => {
    const base = result('plant', 0.5);
    const flora = result('unknown', 0.9);
    expect(pickBest(base, flora)).toBe(base);
  });

  it('keeps base when flora is not more confident (equal)', () => {
    const base = result('plant', 0.6);
    const flora = result('plant', 0.6);
    expect(pickBest(base, flora)).toBe(base);
  });

  it('keeps base when flora is less confident', () => {
    const base = result('plant', 0.8);
    const flora = result('plant', 0.4);
    expect(pickBest(base, flora)).toBe(base);
  });

  it('keeps base when base category is unknown (not flora)', () => {
    const base = result('unknown', 0.2);
    const flora = result('plant', 0.9);
    expect(pickBest(base, flora)).toBe(base);
  });
});
