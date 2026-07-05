import { nextStreak } from '../src/domain/streak';

describe('nextStreak', () => {
  const day = (d: string) => `${d}T12:00:00.000Z`;

  it('starts at 1 with no prior capture', () => {
    expect(nextStreak(null, day('2026-07-05'), 0)).toBe(1);
    expect(nextStreak('', day('2026-07-05'), 0)).toBe(1);
  });

  it('stays the same on a same-day repeat', () => {
    expect(nextStreak(day('2026-07-05'), '2026-07-05T20:00:00.000Z', 4)).toBe(4);
  });

  it('increments on a consecutive day', () => {
    expect(nextStreak(day('2026-07-05'), day('2026-07-06'), 4)).toBe(5);
  });

  it('resets to 1 after a gap', () => {
    expect(nextStreak(day('2026-07-05'), day('2026-07-08'), 4)).toBe(1);
  });

  it('never drops below 1 on same-day with zero current', () => {
    expect(nextStreak(day('2026-07-05'), day('2026-07-05'), 0)).toBe(1);
  });
});
