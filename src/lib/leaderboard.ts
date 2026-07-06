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
import { fetchCommunitySightings, ensureAnonSession } from './community';
import { lifeDexStore } from '@/store/useLifeDexStore';
import {
  MOCK_LEADERBOARD,
  MOCK_CURRENT_USER_ID,
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
  myUserId: string | null,
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

  // Ensure "you" (the real anonymous session uid — the SAME id pushSighting
  // writes under) appears, at 0 community XP if you haven't shared any finds.
  // Do NOT inject the local profile.xp here — that XP is local/seed and must not
  // pollute the community ranking.
  if (myUserId !== null && !byUser.has(myUserId)) {
    byUser.set(myUserId, {
      userId: myUserId,
      xp: 0,
      sightings: 0,
      species: new Set<string>(),
      topRarity: 'common',
    });
  }

  const isMe = (userId: string): boolean => myUserId !== null && userId === myUserId;

  const unranked = Array.from(byUser.values()).sort((a, b) => b.xp - a.xp);

  return unranked.map((acc, index) => ({
    userId: acc.userId,
    username: isMe(acc.userId) && myProfile !== null ? myProfile.username : displayNameFor(acc.userId),
    xp: acc.xp,
    level: isMe(acc.userId) && myProfile !== null ? myProfile.level : 0,
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
  // Simulated board carries the mock current user so the "(You)" highlight +
  // your-rank bar still render.
  const simulated: LeaderboardResult = {
    entries: MOCK_LEADERBOARD,
    source: 'simulated',
    myUserId: MOCK_CURRENT_USER_ID,
  };

  if (!env.useSupabase) return simulated;

  try {
    const [myUserId, sightings] = await Promise.all([
      ensureAnonSession(),
      fetchCommunitySightings(COMMUNITY_FETCH_LIMIT),
    ]);
    const entries = aggregate(sightings, myUserId, lifeDexStore.getProfile());

    if (entries.length === 0) return simulated;

    return { entries, source: 'community', myUserId };
  } catch (e) {
    console.warn('[LifeDex] loadLeaderboard error', e);
    return simulated;
  }
}
