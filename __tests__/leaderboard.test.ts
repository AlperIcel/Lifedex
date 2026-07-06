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

    const result = aggregate(rows, null, null);
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

    const result = aggregate(rows, null, null);

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

    const result = aggregate(rows, null, null);
    expect(result.find((e) => e.userId === 'user-a')?.topRarity).toBe('legendary');
  });

  it('counts unique species distinctly from total sightings', () => {
    const rows: Row[] = [
      row('user-a', 10, 'common', 'Red Fox'),
      row('user-a', 10, 'common', 'Red Fox'), // duplicate species
      row('user-a', 10, 'common', 'European Robin'),
    ];

    const result = aggregate(rows, null, null);
    const a = result.find((e) => e.userId === 'user-a');
    // 3 total sightings, but only 2 unique species were seen.
    expect(a?.sightings).toBe(3);
  });

  it('shows "you" (by session uid) even with zero community rows — at 0 XP, not local XP', () => {
    const profile: Profile = { id: 'mock-user-001', username: 'Naturalist', xp: 500, level: 5 };
    // myUserId is the anon session uid, NOT profile.id.
    const result = aggregate([], 'anon-uid-9', profile);

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe('anon-uid-9');
    expect(result[0]?.username).toBe('Naturalist');
    // Local/seed XP must NOT leak into the community ranking.
    expect(result[0]?.xp).toBe(0);
    expect(result[0]?.sightings).toBe(0);
    expect(result[0]?.rank).toBe(1);
  });

  it('does not duplicate you when your session uid already has community rows', () => {
    const profile: Profile = { id: 'mock-user-001', username: 'Naturalist', xp: 20, level: 1 };
    const rows: Row[] = [row('anon-uid-9', 20, 'common', 'Red Fox')];

    const result = aggregate(rows, 'anon-uid-9', profile);
    const mine = result.filter((e) => e.userId === 'anon-uid-9');

    expect(mine).toHaveLength(1);
    expect(mine[0]?.username).toBe('Naturalist');
    expect(mine[0]?.xp).toBe(20);
    expect(mine[0]?.sightings).toBe(1);
  });
});
