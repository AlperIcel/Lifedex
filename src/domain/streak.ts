/**
 * Daily capture streak — pure logic.
 *
 * A streak counts consecutive calendar days on which the user captured at least
 * one new species. Same-day repeat captures don't change it; a one-day gap
 * increments it; a longer gap resets to 1. The scoring engine consumes the
 * resulting `streak` for a small bonus.
 *
 * Days are compared in UTC (stable across the app; good enough for a game streak).
 */

const DAY_MS = 86_400_000;

function utcDayNumber(iso: string): number {
  return Math.floor(Date.parse(iso) / DAY_MS);
}

/**
 * Compute the streak after a capture at `nowISO`, given the last capture time and
 * the current streak value.
 * - no prior capture -> 1
 * - same day (or clock skew) -> unchanged (min 1)
 * - exactly the next day -> current + 1
 * - a longer gap -> reset to 1
 */
export function nextStreak(lastISO: string | null, nowISO: string, current: number): number {
  if (lastISO === null || lastISO.length === 0) return 1;
  const diff = utcDayNumber(nowISO) - utcDayNumber(lastISO);
  if (diff <= 0) return Math.max(current, 1);
  if (diff === 1) return current + 1;
  return 1;
}
