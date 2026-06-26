/**
 * Mock leaderboard data — no API keys required.
 * Designed to exercise every rarity tier and the current-user highlight.
 */
import type { Rarity } from '@/domain/types';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  xp: number;
  level: number;
  rank: number;
  sightings: number;
  topRarity: Rarity;
}

/**
 * The mock user id that represents "you" in the leaderboard.
 * Change this to any userId in MOCK_LEADERBOARD to preview the self-highlight.
 */
export const MOCK_CURRENT_USER_ID = 'user-07';

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    userId: 'user-01',
    username: 'WildLens_Maya',
    xp: 148_200,
    level: 74,
    rank: 1,
    sightings: 412,
    topRarity: 'legendary',
  },
  {
    userId: 'user-02',
    username: 'FoxTracker',
    xp: 121_750,
    level: 61,
    rank: 2,
    sightings: 389,
    topRarity: 'epic',
  },
  {
    userId: 'user-03',
    username: 'MushroomMagic',
    xp: 98_400,
    level: 49,
    rank: 3,
    sightings: 305,
    topRarity: 'epic',
  },
  {
    userId: 'user-04',
    username: 'HedgehogHunter',
    xp: 76_100,
    level: 38,
    rank: 4,
    sightings: 271,
    topRarity: 'rare',
  },
  {
    userId: 'user-05',
    username: 'Birder_Kai',
    xp: 63_500,
    level: 32,
    rank: 5,
    sightings: 244,
    topRarity: 'rare',
  },
  {
    userId: 'user-06',
    username: 'OrchidSeeker',
    xp: 54_800,
    level: 27,
    rank: 6,
    sightings: 198,
    topRarity: 'rare',
  },
  {
    userId: 'user-07',
    username: 'NaturePilgrim',
    xp: 41_300,
    level: 21,
    rank: 7,
    sightings: 157,
    topRarity: 'uncommon',
  },
  {
    userId: 'user-08',
    username: 'TreeWhisperer',
    xp: 32_900,
    level: 16,
    rank: 8,
    sightings: 134,
    topRarity: 'uncommon',
  },
  {
    userId: 'user-09',
    username: 'DewDropDiana',
    xp: 26_450,
    level: 13,
    rank: 9,
    sightings: 110,
    topRarity: 'uncommon',
  },
  {
    userId: 'user-10',
    username: 'ParkRanger_Leo',
    xp: 21_700,
    level: 11,
    rank: 10,
    sightings: 89,
    topRarity: 'common',
  },
  {
    userId: 'user-11',
    username: 'MossAndStone',
    xp: 17_200,
    level: 9,
    rank: 11,
    sightings: 73,
    topRarity: 'common',
  },
  {
    userId: 'user-12',
    username: 'UrbanBotanist',
    xp: 13_400,
    level: 7,
    rank: 12,
    sightings: 58,
    topRarity: 'common',
  },
  {
    userId: 'user-13',
    username: 'SilentSprout',
    xp: 9_850,
    level: 5,
    rank: 13,
    sightings: 42,
    topRarity: 'common',
  },
  {
    userId: 'user-14',
    username: 'GardenGhost',
    xp: 6_700,
    level: 3,
    rank: 14,
    sightings: 31,
    topRarity: 'common',
  },
  {
    userId: 'user-15',
    username: 'NewSprout_Sam',
    xp: 3_200,
    level: 1,
    rank: 15,
    sightings: 14,
    topRarity: 'common',
  },
];
