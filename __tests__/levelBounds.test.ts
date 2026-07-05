/**
 * Tests for the quadratic level ladder (fixes the Home ring using a divergent
 * linear formula).
 */
import { xpToLevel, levelBounds } from '../src/store/useLifeDexStore';

describe('xpToLevel', () => {
  it('level 1 at 0 XP, boundaries at 100*(n-1)^2', () => {
    expect(xpToLevel(0)).toBe(1);
    expect(xpToLevel(99)).toBe(1);
    expect(xpToLevel(100)).toBe(2); // 100*(2-1)^2
    expect(xpToLevel(400)).toBe(3); // 100*(3-1)^2
    expect(xpToLevel(900)).toBe(4);
  });

  it('never returns below 1, handles negatives', () => {
    expect(xpToLevel(-50)).toBe(1);
  });
});

describe('levelBounds', () => {
  it('reports floor/ceil/progress for the current level', () => {
    const b = levelBounds(250); // level 2: floor 100, ceil 400
    expect(b.level).toBe(2);
    expect(b.floor).toBe(100);
    expect(b.ceil).toBe(400);
    expect(b.progress).toBeCloseTo((250 - 100) / (400 - 100));
    expect(b.toNext).toBe(150);
  });

  it('progress is clamped to 0..1', () => {
    expect(levelBounds(0).progress).toBe(0);
    const b = levelBounds(100); // exactly at level-2 floor
    expect(b.progress).toBe(0);
  });
});
