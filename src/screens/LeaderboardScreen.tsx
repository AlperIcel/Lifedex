/**
 * LeaderboardScreen — global XP ranking, top-3 podium, your-rank row.
 *
 * Data source: `loadLeaderboard()` (src/lib/leaderboard.ts) — real community
 * aggregation when Supabase is configured, simulated (mock) data otherwise or
 * on any failure. A source Chip in the header tells you which one you're
 * looking at ("Community" / "Simulated").
 *
 * Global/Weekly/Local segmented control is visual-only for now: all three
 * tabs render the same aggregated data (no time/geo windowing yet).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { RootTabParamList } from '@/navigation/types';
import type { Rarity } from '@/domain/types';
import { colors, radius, spacing, typography } from '@/theme/theme';
import type { LeaderboardEntry } from '@/screens/leaderboard/mockData';
import { loadLeaderboard, type LeaderboardResult } from '@/lib/leaderboard';
import { Chip, EmptyState, LoadingState, ScreenContainer } from '@/components';
import { haptics } from '@/utils/haptics';
import { useT } from '@/i18n';

/* ------------------------------------------------------------------ */
/* Screen prop type                                                     */
/* ------------------------------------------------------------------ */

type Props = BottomTabScreenProps<RootTabParamList, 'Leaderboard'>;

const C = {
  en: {
    title: 'Leaderboard',
    loading: 'Loading rankings...',
    emptyTitle: 'No rankings yet',
    emptyMessage: 'Check back soon — the leaderboard fills in as explorers log sightings.',
    sourceCommunity: 'Community',
    sourceSimulated: 'Simulated',
    simNote:
      'Example players — not real people. Real rankings appear once a community backend is connected.',
    sectionRanking: 'Ranking',
    youSuffix: '  (You)',
    found: '{n} found',
    yourRank: 'Your rank',
    tabGlobal: 'Global',
    tabWeekly: 'Weekly',
    tabLocal: 'Local',
  },
  de: {
    title: 'Bestenliste',
    loading: 'Rangliste wird geladen...',
    emptyTitle: 'Noch keine Ränge',
    emptyMessage: 'Schau bald wieder vorbei – die Bestenliste füllt sich, sobald Entdecker ihre Funde eintragen.',
    sourceCommunity: 'Community',
    sourceSimulated: 'Simuliert',
    simNote:
      'Beispiel-Spieler – keine echten Personen. Echte Ränge erscheinen, sobald ein Community-Backend verbunden ist.',
    sectionRanking: 'Rangliste',
    youSuffix: '  (Du)',
    found: '{n} gefunden',
    yourRank: 'Dein Rang',
    tabGlobal: 'Global',
    tabWeekly: 'Wöchentlich',
    tabLocal: 'Lokal',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Medal colors (semantic — not part of the shared theme palette)      */
/* ------------------------------------------------------------------ */

const MEDAL = {
  gold: '#F5B841',
  silver: '#C9D1CC',
  bronze: '#CD7F32',
} as const;

const RANK_MEDAL_COLOR: Record<number, string> = {
  1: MEDAL.gold,
  2: MEDAL.silver,
  3: MEDAL.bronze,
};

const RARITY_BORDER: Record<Rarity, string> = {
  common: colors.border,
  uncommon: colors.success,
  rare: colors.info,
  epic: '#A66CFF',
  legendary: MEDAL.gold,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** XP formatted with K/M suffix. */
function xpLabel(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`;
  return String(xp);
}

function initialsFor(username: string): string {
  return username
    .split(/[\s_-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('');
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

function Avatar({
  username,
  rarity,
  size,
  ringColor,
}: {
  username: string;
  rarity: Rarity;
  size: number;
  /** Overrides the rarity-derived ring colour (used for podium medal rings). */
  ringColor?: string;
}) {
  const borderColor = ringColor ?? RARITY_BORDER[rarity];
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor,
          borderWidth: 2,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initialsFor(username)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Podium (top 3)                                                      */
/* ------------------------------------------------------------------ */

const PODIUM_ORDER = [2, 1, 3] as const; // left-centre-right visual order

function RankBadge({ rank }: { rank: number }) {
  return (
    <View style={[styles.rankBadge, { backgroundColor: RANK_MEDAL_COLOR[rank] ?? colors.surfaceHigh }]}>
      <Text style={styles.rankBadgeText}>{rank}</Text>
    </View>
  );
}

function PodiumColumn({ entry, isWinner }: { entry: LeaderboardEntry; isWinner: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  return (
    <Animated.View
      style={[
        styles.podiumCard,
        isWinner && styles.podiumCardWinner,
        { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      <RankBadge rank={entry.rank} />
      <Avatar
        username={entry.username}
        rarity={entry.topRarity}
        size={isWinner ? 56 : 44}
        ringColor={RANK_MEDAL_COLOR[entry.rank]}
      />
      <Text style={[styles.podiumUsername, isWinner && styles.podiumUsernameWinner]} numberOfLines={1}>
        {entry.username}
      </Text>
      <Text style={styles.podiumXp}>{xpLabel(entry.xp)} XP</Text>
    </Animated.View>
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
        return <PodiumColumn key={rank} entry={entry} isWinner={rank === 1} />;
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* List row (rank 4+)                                                  */
/* ------------------------------------------------------------------ */

function LeaderRow({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  const t = useT(C);
  return (
    <View style={[styles.leaderRow, isCurrentUser && styles.leaderRowSelf]}>
      <View style={styles.rankCell}>
        <Text style={[styles.rankNum, isCurrentUser && styles.rankNumSelf]}>{entry.rank}</Text>
      </View>

      <Avatar username={entry.username} rarity={entry.topRarity} size={38} />

      <View style={styles.leaderNameBlock}>
        <Text style={[styles.leaderUsername, isCurrentUser && styles.leaderUsernameSelf]} numberOfLines={1}>
          {entry.username}
          {isCurrentUser ? t('youSuffix') : ''}
        </Text>
        <Text style={styles.leaderFootnote}>{t('found', { n: entry.sightings })}</Text>
      </View>

      <Text style={styles.leaderXp}>{xpLabel(entry.xp)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control (Global / Weekly / Local) — visual only            */
/* ------------------------------------------------------------------ */

type FilterTab = 'Global' | 'Weekly' | 'Local';
const FILTER_TABS: FilterTab[] = ['Global', 'Weekly', 'Local'];
const TAB_LABEL_KEY: Record<FilterTab, 'tabGlobal' | 'tabWeekly' | 'tabLocal'> = {
  Global: 'tabGlobal',
  Weekly: 'tabWeekly',
  Local: 'tabLocal',
};

function SegmentedControl({ active, onSelect }: { active: FilterTab; onSelect: (t: FilterTab) => void }) {
  const t = useT(C);
  return (
    <View style={styles.segmentRow}>
      {FILTER_TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.segment, active === tab && styles.segmentActive]}
          onPress={() => onSelect(tab)}
          activeOpacity={0.75}
        >
          <Text style={[styles.segmentText, active === tab && styles.segmentTextActive]}>
            {t(TAB_LABEL_KEY[tab])}
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
  const t = useT(C);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Global');
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LeaderboardResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadLeaderboard()
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = result?.entries ?? [];
  const source = result?.source ?? 'simulated';

  const podiumEntries = useMemo(() => entries.filter((e) => e.rank <= 3), [entries]);
  const listEntries = useMemo(() => entries.filter((e) => e.rank > 3), [entries]);

  const myUserId = result?.myUserId ?? null;
  const currentUserEntry = useMemo(
    () => (myUserId === null ? undefined : entries.find((e) => e.userId === myUserId)),
    [entries, myUserId],
  );

  const handleSelectFilter = useCallback((tab: FilterTab) => {
    haptics.tap();
    setActiveFilter(tab);
  }, []);

  if (loading) {
    return (
      <ScreenContainer title={t('title')} largeTitle>
        <LoadingState label={t('loading')} />
      </ScreenContainer>
    );
  }

  if (entries.length === 0) {
    return (
      <ScreenContainer title={t('title')} largeTitle>
        <EmptyState icon="podium-outline" title={t('emptyTitle')} message={t('emptyMessage')} />
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <ScreenContainer
        title={t('title')}
        largeTitle
        scrollable
        padBottom
        rightAccessory={
          <Chip
            label={source === 'community' ? t('sourceCommunity') : t('sourceSimulated')}
            selected={source === 'community'}
            onPress={() => {}}
            icon={source === 'community' ? 'people' : 'flask-outline'}
          />
        }
      >
        <SegmentedControl active={activeFilter} onSelect={handleSelectFilter} />

        {source === 'simulated' && (
          <View style={styles.simNote}>
            <Ionicons name="flask-outline" size={15} color={colors.textMuted} style={styles.simNoteIcon} />
            <Text style={styles.simNoteText}>{t('simNote')}</Text>
          </View>
        )}

        <Podium entries={podiumEntries} />

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>{t('sectionRanking')}</Text>

        <View>
          {listEntries.map((entry) => (
            <LeaderRow key={entry.userId} entry={entry} isCurrentUser={entry.userId === myUserId} />
          ))}
        </View>
      </ScreenContainer>

      {currentUserEntry !== undefined && (
        <View style={styles.yourRankBar}>
          <View style={styles.yourRankLeft}>
            <Text style={styles.yourRankLabel}>{t('yourRank')}</Text>
            <Text style={styles.yourRankNumber}>#{currentUserEntry.rank}</Text>
          </View>

          <Avatar username={currentUserEntry.username} rarity={currentUserEntry.topRarity} size={36} />

          <View style={styles.yourRankRight}>
            <Text style={styles.yourRankXp}>{xpLabel(currentUserEntry.xp)} XP</Text>
            <Text style={styles.yourRankSightings}>{t('found', { n: currentUserEntry.sightings })}</Text>
          </View>
        </View>
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

  /* Segmented control */
  segmentRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    ...typography.label,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.onAccent,
    fontWeight: '700',
  },

  /* Simulated-data honesty note */
  simNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  simNoteIcon: {
    marginTop: 1,
  },
  simNoteText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 17,
  },

  /* Podium */
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  podiumCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  podiumCardWinner: {
    paddingVertical: spacing.md + 8, // ~8px taller than the side cards
    borderColor: MEDAL.gold,
    backgroundColor: colors.surfaceElevated,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    ...typography.caption,
    color: colors.onAccent,
    fontWeight: '800',
  },
  podiumUsername: {
    ...typography.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  podiumUsernameWinner: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  podiumXp: {
    ...typography.caption,
    color: colors.amber,
    fontVariant: ['tabular-nums'],
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

  /* Section divider */
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  /* Leader row */
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  leaderRowSelf: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  rankCell: {
    width: 32,
    alignItems: 'center',
  },
  rankNum: {
    ...typography.headline,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  rankNumSelf: {
    color: colors.accent,
  },
  leaderNameBlock: {
    flex: 1,
    gap: 2,
  },
  leaderUsername: {
    ...typography.body,
    color: colors.textPrimary,
  },
  leaderUsernameSelf: {
    color: colors.accent,
    fontWeight: '600',
  },
  leaderFootnote: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
  leaderXp: {
    ...typography.headline,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    minWidth: 56,
  },

  /* Your rank bar */
  yourRankBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
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
    ...typography.title2,
    color: colors.accent,
    fontWeight: '800',
  },
  yourRankRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  yourRankXp: {
    ...typography.headline,
    color: colors.amber,
  },
  yourRankSightings: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
