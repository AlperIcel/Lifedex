/**
 * Leaderboard data source — real community aggregation with a simulated
 * fallback.
 *
 * When Supabase is not configured (`env.useSupabase === false`) the board is
 * fully simulated (MOCK_LEADERBOARD) — same behaviour as before this file
 * existed. When Supabase IS configured, this aggregates public community
 * sightings (via `fetchCommunitySightings`, already guarded/best-effort) into
 * per-user leaderboard rows. Any failure, or an aggregation that yields zero
 * rows, falls back to the simulated board so the screen never renders empty
 * by accident.
 *
 * `aggregate` is kept pure (no supabase import, no async) so it is trivially
 * unit-testable — it only knows about plain Sighting-shaped rows and a
 * Profile.
 */
import type { Profile, Rarity, Sighting } from '@/domain/types';
import { env } from '@/config/env';
import { fetchCommunitySightings } from './community';
import { lifeDexStore } from '@/store/useLifeDexStore';
import {
  MOCK_LEADERBOARD,
  type LeaderboardEntry,
} from '@/screens/leaderboard/mockData';

/** How many recent community rows to pull for aggregation. */
const COMMUNITY_FETCH_LIMIT = 500;

/** Rarity rank used to pick each user's "best" rarity for the avatar ring. */
const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  source: 'community' | 'simulated';
  myUserId: string | null;
}

/** Short, stable display name derived from a userId (no PII, no lookups). */
function displayNameFor(userId: string): string {
  const short = userId.replace(/-/g, '').slice(-5).toUpperCase();
  return `Explorer-${short}`;
}

/**
 * Aggregate raw community sighting rows into ranked leaderboard entries.
 * Pure: no I/O, no supabase import — safe to unit test directly.
 *
 * - Sums xp and counts sightings per userId.
 * - Tracks each user's highest-rarity sighting for the avatar ring.
 * - Tracks unique species (by commonName) per user (informational; folded
 *   into `sightings` count via the same rows — sightings itself already
 *   counts total finds, unique species is only used to pick topRarity).
 * - Merges in the local profile (`myProfile`) so "you" always appear, even
 *   with zero community rows, at 0 XP / 0 sightings.
 * - Sorts by xp desc and assigns 1-based ranks.
 */
export function aggregate(
  rows: Pick<Sighting, 'userId' | 'xp' | 'rarity' | 'commonName'>[],
  myProfile: Profile | null,
): LeaderboardEntry[] {
  interface Acc {
    userId: string;
    xp: number;
    sightings: number;
    species: Set<string>;
    topRarity: Rarity;
  }

  const byUser = new Map<string, Acc>();

  for (const row of rows) {
    let acc = byUser.get(row.userId);
    if (acc === undefined) {
      acc = {
        userId: row.userId,
        xp: 0,
        sightings: 0,
        species: new Set<string>(),
        topRarity: 'common',
      };
      byUser.set(row.userId, acc);
    }
    acc.xp += row.xp;
    acc.sightings += 1;
    acc.species.add(row.commonName);
    if (RARITY_RANK[row.rarity] > RARITY_RANK[acc.topRarity]) {
      acc.topRarity = row.rarity;
    }
  }

  // Merge in "you" so the local profile always has a row, even at 0 XP.
  if (myProfile !== null) {
    const mine = byUser.get(myProfile.id);
    if (mine === undefined) {
      byUser.set(myProfile.id, {
        userId: myProfile.id,
        xp: myProfile.xp,
        sightings: 0,
        species: new Set<string>(),
        topRarity: 'common',
      });
    }
  }

  const unranked = Array.from(byUser.values()).sort((a, b) => b.xp - a.xp);

  return unranked.map((acc, index) => ({
    userId: acc.userId,
    username:
      myProfile !== null && acc.userId === myProfile.id
        ? myProfile.username
        : displayNameFor(acc.userId),
    xp: acc.xp,
    level: myProfile !== null && acc.userId === myProfile.id ? myProfile.level : 0,
    rank: index + 1,
    sightings: acc.sightings,
    topRarity: acc.topRarity,
  }));
}

/**
 * Load the leaderboard: real community data when Supabase is configured,
 * simulated (MOCK_LEADERBOARD) otherwise or on any failure/empty result.
 */
export async function loadLeaderboard(): Promise<LeaderboardResult> {
  if (!env.useSupabase) {
    return { entries: MOCK_LEADERBOARD, source: 'simulated', myUserId: null };
  }

  try {
    const sightings = await fetchCommunitySightings(COMMUNITY_FETCH_LIMIT);
    const myProfile = lifeDexStore.getProfile();
    const entries = aggregate(sightings, myProfile);

    if (entries.length === 0) {
      return { entries: MOCK_LEADERBOARD, source: 'simulated', myUserId: null };
    }

    return { entries, source: 'community', myUserId: myProfile.id };
  } catch (e) {
    console.warn('[LifeDex] loadLeaderboard error', e);
    return { entries: MOCK_LEADERBOARD, source: 'simulated', myUserId: null };
  }
}
