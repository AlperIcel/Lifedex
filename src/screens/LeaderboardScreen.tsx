/**
 * LeaderboardScreen — global XP ranking, top-3 podium, your-rank row.
 * All data is mock; no API keys required.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RootTabParamList } from '@/navigation/types';
import type { Rarity } from '@/domain/types';
import { colors, rarityColors, spacing, radius, typography } from '@/theme/theme';
import type { LeaderboardEntry } from '@/screens/leaderboard/mockData';
import { useLifeDexStore } from '@/store/useLifeDexStore';

/* ------------------------------------------------------------------ */
/* Screen prop type                                                     */
/* ------------------------------------------------------------------ */

type Props = BottomTabScreenProps<RootTabParamList, 'Leaderboard'>;

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const SCREEN_WIDTH = Dimensions.get('window').width;
const PODIUM_CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2) / 3;

const RARITY_BORDER: Record<Rarity, string> = {
  common: colors.border,
  uncommon: rarityColors.uncommon,
  rare: rarityColors.rare,
  epic: rarityColors.epic,
  legendary: rarityColors.legendary,
};

const RANK_MEDAL: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

/* ------------------------------------------------------------------ */
/* Small reusable components                                           */
/* ------------------------------------------------------------------ */

/** Avatar placeholder built from username initials + rarity accent ring. */
function Avatar({
  username,
  rarity,
  size,
}: {
  username: string;
  rarity: Rarity;
  size: number;
}) {
  const initials = username
    .split(/[\s_-]/)
    .slice(0, 2)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('');

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: RARITY_BORDER[rarity],
          borderWidth: 2,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

/** Rarity badge pill shown next to usernames. */
function RarityBadge({ rarity }: { rarity: Rarity }) {
  return (
    <View style={[styles.rarityBadge, { borderColor: rarityColors[rarity] }]}>
      <Text style={[styles.rarityBadgeText, { color: rarityColors[rarity] }]}>
        {rarity.toUpperCase()}
      </Text>
    </View>
  );
}

/** XP formatted with K suffix. */
function xpLabel(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`;
  return String(xp);
}

/* ------------------------------------------------------------------ */
/* Podium (top 3)                                                      */
/* ------------------------------------------------------------------ */

const PODIUM_HEIGHTS: Record<number, number> = { 1: 90, 2: 64, 3: 50 };
const PODIUM_ORDER = [2, 1, 3] as const; // left-centre-right visual order

function PodiumColumn({ entry }: { entry: LeaderboardEntry }) {
  const barHeight = PODIUM_HEIGHTS[entry.rank] ?? 50;
  const isFirst = entry.rank === 1;

  return (
    <View style={[styles.podiumColumn, { width: PODIUM_CARD_WIDTH }]}>
      {/* Crown for first place */}
      {isFirst && (
        <Text style={styles.crownIcon}>👑</Text>
      )}

      <Avatar username={entry.username} rarity={entry.topRarity} size={isFirst ? 56 : 44} />

      <Text
        style={[styles.podiumUsername, isFirst && styles.podiumUsernameFirst]}
        numberOfLines={1}
      >
        {entry.username}
      </Text>

      <Text style={styles.podiumXp}>{xpLabel(entry.xp)} XP</Text>

      {/* Podium base bar */}
      <View
        style={[
          styles.podiumBar,
          {
            height: barHeight,
            backgroundColor:
              entry.rank === 1
                ? colors.amber
                : entry.rank === 2
                ? colors.textSecondary
                : '#8B6914',
            borderTopLeftRadius: radius.sm,
            borderTopRightRadius: radius.sm,
          },
        ]}
      >
        <Text style={styles.podiumRankText}>#{entry.rank}</Text>
      </View>
    </View>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const byRank: Record<number, LeaderboardEntry> = {};
  for (const e of entries) byRank[e.rank] = e;

  return (
    <View style={styles.podiumRow}>
      {PODIUM_ORDER.map((rank) => {
        const entry = byRank[rank];
        if (!entry) return null;
        return <PodiumColumn key={rank} entry={entry} />;
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* List row (rank 4+)                                                  */
/* ------------------------------------------------------------------ */

function LeaderRow({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  return (
    <View
      style={[
        styles.leaderRow,
        isCurrentUser && styles.leaderRowSelf,
      ]}
    >
      {/* Rank number */}
      <View style={styles.rankCell}>
        <Text style={[styles.rankNum, isCurrentUser && { color: colors.teal }]}>
          {RANK_MEDAL[entry.rank] ?? `#${entry.rank}`}
        </Text>
      </View>

      {/* Avatar */}
      <Avatar username={entry.username} rarity={entry.topRarity} size={38} />

      {/* Name + badge */}
      <View style={styles.leaderNameBlock}>
        <Text
          style={[styles.leaderUsername, isCurrentUser && { color: colors.teal }]}
          numberOfLines={1}
        >
          {entry.username}
          {isCurrentUser ? '  (You)' : ''}
        </Text>
        <RarityBadge rarity={entry.topRarity} />
      </View>

      {/* Stats */}
      <View style={styles.leaderStats}>
        <Text style={styles.leaderXp}>{xpLabel(entry.xp)}</Text>
        <Text style={styles.leaderXpLabel}>XP</Text>
      </View>

      <View style={styles.leaderSightings}>
        <Text style={styles.leaderSightingCount}>{entry.sightings}</Text>
        <Text style={styles.leaderSightingLabel}>found</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Your-rank sticky footer                                             */
/* ------------------------------------------------------------------ */

function YourRankBar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View style={styles.yourRankBar}>
      <View style={styles.yourRankLeft}>
        <Text style={styles.yourRankLabel}>Your rank</Text>
        <Text style={styles.yourRankNumber}>#{entry.rank}</Text>
      </View>

      <Avatar username={entry.username} rarity={entry.topRarity} size={36} />

      <View style={styles.yourRankRight}>
        <Text style={styles.yourRankXp}>{xpLabel(entry.xp)} XP</Text>
        <Text style={styles.yourRankSightings}>{entry.sightings} sightings</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Filter tabs                                                         */
/* ------------------------------------------------------------------ */

type FilterTab = 'Global' | 'Weekly' | 'Local';
const FILTER_TABS: FilterTab[] = ['Global', 'Weekly', 'Local'];

function FilterTabs({
  active,
  onSelect,
}: {
  active: FilterTab;
  onSelect: (t: FilterTab) => void;
}) {
  return (
    <View style={styles.filterTabRow}>
      {FILTER_TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.filterTab, active === tab && styles.filterTabActive]}
          onPress={() => onSelect(tab)}
          activeOpacity={0.75}
        >
          <Text style={[styles.filterTabText, active === tab && styles.filterTabTextActive]}>
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

export default function LeaderboardScreen(_props: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Global');

  const { leaderboardEntries, currentUserId } = useLifeDexStore();

  // All entries; top-3 go into podium, rest into flat list
  const podiumEntries = useMemo(
    () => leaderboardEntries.filter((e) => e.rank <= 3),
    [leaderboardEntries],
  );
  const listEntries = useMemo(
    () => leaderboardEntries.filter((e) => e.rank > 3),
    [leaderboardEntries],
  );

  const currentUserEntry = useMemo(
    () => leaderboardEntries.find((e) => e.userId === currentUserId),
    [leaderboardEntries, currentUserId],
  );

  const renderItem = ({ item }: { item: LeaderboardEntry }) => (
    <LeaderRow entry={item} isCurrentUser={item.userId === currentUserId} />
  );

  const ListHeader = (
    <View>
      {/* Screen title */}
      <View style={styles.headerBlock}>
        <Text style={styles.screenTitle}>Leaderboard</Text>
        <Text style={styles.screenSubtitle}>Top LifeDex explorers worldwide</Text>
      </View>

      {/* Filter tabs */}
      <FilterTabs active={activeFilter} onSelect={setActiveFilter} />

      {/* Podium */}
      <Podium entries={podiumEntries} />

      {/* Divider */}
      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Ranking</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <FlatList<LeaderboardEntry>
        data={listEntries}
        keyExtractor={(item) => item.userId}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Scroll past the sticky bar at the bottom
        contentInset={{ bottom: 72 }}
      />

      {/* Sticky your-rank bar */}
      {currentUserEntry !== undefined && (
        <YourRankBar entry={currentUserEntry} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Header */
  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  screenTitle: {
    ...typography.display,
    color: colors.textPrimary,
  },
  screenSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  /* Filter */
  filterTabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  filterTabActive: {
    backgroundColor: colors.teal,
  },
  filterTabText: {
    ...typography.label,
    color: colors.textMuted,
  },
  filterTabTextActive: {
    color: colors.background,
    fontWeight: '700',
  },

  /* Podium */
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  podiumColumn: {
    alignItems: 'center',
  },
  crownIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  podiumUsername: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  podiumUsernameFirst: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  podiumXp: {
    ...typography.label,
    color: colors.amber,
    marginBottom: spacing.sm,
  },
  podiumBar: {
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  podiumRankText: {
    ...typography.heading,
    color: colors.background,
    fontWeight: '800',
  },

  /* Avatar */
  avatar: {
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  /* Rarity badge */
  rarityBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  rarityBadgeText: {
    ...typography.label,
    fontSize: 9,
  },

  /* Section divider */
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  /* List */
  listContent: {
    paddingBottom: spacing.xxl,
  },

  /* Leader row */
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  leaderRowSelf: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.teal,
  },
  rankCell: {
    width: 36,
    alignItems: 'center',
  },
  rankNum: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  leaderNameBlock: {
    flex: 1,
    gap: 4,
  },
  leaderUsername: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  leaderStats: {
    alignItems: 'flex-end',
    minWidth: 56,
  },
  leaderXp: {
    ...typography.body,
    color: colors.amber,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  leaderXpLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  leaderSightings: {
    alignItems: 'flex-end',
    minWidth: 44,
  },
  leaderSightingCount: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  leaderSightingLabel: {
    ...typography.label,
    color: colors.textMuted,
  },

  /* Your rank bar */
  yourRankBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.teal,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg, // safe area buffer
    gap: spacing.md,
  },
  yourRankLeft: {
    alignItems: 'flex-start',
  },
  yourRankLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  yourRankNumber: {
    ...typography.title,
    color: colors.teal,
    fontWeight: '800',
  },
  yourRankRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  yourRankXp: {
    ...typography.heading,
    color: colors.amber,
    fontWeight: '700',
  },
  yourRankSightings: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
