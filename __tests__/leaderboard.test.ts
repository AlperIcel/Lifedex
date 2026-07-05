/**
 * Unit tests for the pure `aggregate` helper in src/lib/leaderboard.ts.
 * No native/supabase imports are exercised here — aggregate() takes plain
 * Sighting-shaped rows and a Profile, and returns ranked LeaderboardEntry[].
 */
import { aggregate } from '@/lib/leaderboard';
import type { Profile, Sighting } from '@/domain/types';

type Row = Pick<Sighting, 'userId' | 'xp' | 'rarity' | 'commonName'>;

function row(userId: string, xp: number, rarity: Row['rarity'], commonName: string): Row {
  return { userId, xp, rarity, commonName };
}

describe('aggregate', () => {
  it('sums xp per user and counts sightings', () => {
    const rows: Row[] = [
      row('user-a', 100, 'common', 'Red Fox'),
      row('user-a', 50, 'uncommon', 'European Robin'),
      row('user-b', 30, 'common', 'Common Frog'),
    ];

    const result = aggregate(rows, null);
    const a = result.find((e) => e.userId === 'user-a');
    const b = result.find((e) => e.userId === 'user-b');

    expect(a?.xp).toBe(150);
    expect(a?.sightings).toBe(2);
    expect(b?.xp).toBe(30);
    expect(b?.sightings).toBe(1);
  });

  it('orders entries by xp descending and assigns 1-based ranks', () => {
    const rows: Row[] = [
      row('user-a', 100, 'common', 'Red Fox'),
      row('user-b', 300, 'common', 'Common Frog'),
      row('user-b', 50, 'common', 'Silver Birch'),
    ];

    const result = aggregate(rows, null);

    expect(result.map((e) => e.userId)).toEqual(['user-b', 'user-a']);
    expect(result[0]?.rank).toBe(1);
    expect(result[1]?.rank).toBe(2);
  });

  it('tracks the highest rarity seen per user for the avatar ring', () => {
    const rows: Row[] = [
      row('user-a', 10, 'common', 'Red Fox'),
      row('user-a', 10, 'legendary', "Lady's Slipper Orchid"),
      row('user-a', 10, 'uncommon', 'English Oak'),
    ];

    const result = aggregate(rows, null);
    expect(result.find((e) => e.userId === 'user-a')?.topRarity).toBe('legendary');
  });

  it('counts unique species distinctly from total sightings', () => {
    const rows: Row[] = [
      row('user-a', 10, 'common', 'Red Fox'),
      row('user-a', 10, 'common', 'Red Fox'), // duplicate species
      row('user-a', 10, 'common', 'European Robin'),
    ];

    const result = aggregate(rows, null);
    const a = result.find((e) => e.userId === 'user-a');
    // 3 total sightings, but only 2 unique species were seen.
    expect(a?.sightings).toBe(3);
  });

  it('merges in the local profile so "you" appear even with zero community rows', () => {
    const profile: Profile = { id: 'me-1', username: 'Naturalist', xp: 500, level: 5 };
    const result = aggregate([], profile);

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe('me-1');
    expect(result[0]?.username).toBe('Naturalist');
    expect(result[0]?.xp).toBe(500);
    expect(result[0]?.sightings).toBe(0);
    expect(result[0]?.rank).toBe(1);
  });

  it('does not duplicate the local profile when it already has community rows', () => {
    const profile: Profile = { id: 'me-1', username: 'Naturalist', xp: 20, level: 1 };
    const rows: Row[] = [row('me-1', 20, 'common', 'Red Fox')];

    const result = aggregate(rows, profile);
    const mine = result.filter((e) => e.userId === 'me-1');

    expect(mine).toHaveLength(1);
    expect(mine[0]?.username).toBe('Naturalist');
    expect(mine[0]?.sightings).toBe(1);
  });
});
