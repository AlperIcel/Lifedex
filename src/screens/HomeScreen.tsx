/**
 * HomeScreen — LifeDex main hub.
 *
 * Sections:
 *  1. Header bar — wordmark + daily capture badge
 *  2. Hero — LevelRing with XP progress, total-species count, total XP
 *  3. Recent Discoveries — horizontal ScrollView carousel of sighting cards
 *  4. Rare Nearby — vertical list of nearby-rare species hints
 *
 * All data comes from useLifeDexStore (in-memory, no API keys required).
 * Navigation: tapping a discovery card pushes CardDetail; tapping Capture
 * navigates to the Capture tab.
 */
import React, { useCallback, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { LevelRing } from '@/components/LevelRing';
import { RarityBadge } from '@/components/RarityBadge';
import { XPRing } from '@/components/XPRing';
import type { Rarity, Sighting } from '@/domain/types';
import {
  selectRecentDiscoveries,
  selectTodayCount,
  selectTotalSpecies,
  useLifeDexStore,
} from '@/store/useLifeDexStore';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, rarityColors, spacing, typography } from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* Nearby-rare hint type (UI teaser only — not a persisted Sighting)   */
/* ------------------------------------------------------------------ */

interface NearbyRareHint {
  id: string;
  commonName: string;
  scientificName?: string;
  rarity: Rarity;
  distanceMeters: number;
  category: string;
}

const MOCK_NEARBY_RARE: NearbyRareHint[] = [
  { id: 'nr1', commonName: 'Little Owl', scientificName: 'Athene noctua', rarity: 'rare', distanceMeters: 340, category: 'animal' },
  { id: 'nr2', commonName: "Lady's Slipper Orchid", scientificName: 'Cypripedium calceolus', rarity: 'legendary', distanceMeters: 870, category: 'plant' },
  { id: 'nr3', commonName: 'Ghost Orchid Fungus', scientificName: 'Epipogium aphyllum', rarity: 'legendary', distanceMeters: 1200, category: 'mushroom' },
];

/** XP span of one level — local to the Home level-bar math. */
const XP_PER_LEVEL = 200;

/* ------------------------------------------------------------------ */
/* Category icons (text emoji — no image assets needed)                */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<string, string> = {
  animal: '🦊',
  plant: '🌿',
  tree: '🌳',
  mushroom: '🍄',
  unknown: '❔',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                        */
/* ------------------------------------------------------------------ */

/** Single card in the Recent Discoveries horizontal carousel. */
function DiscoveryCard({ sighting, onPress }: { sighting: Sighting; onPress: () => void }) {
  const rarityColor = rarityColors[sighting.rarity];
  const icon = CATEGORY_ICON[sighting.category] ?? '❔';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.discoveryCard, pressed && styles.cardPressed]}
    >
      {/* Top accent bar */}
      <View style={[styles.cardAccent, { backgroundColor: rarityColor }]} />

      {/* Card image placeholder */}
      <View style={[styles.cardImageArea, { backgroundColor: `${rarityColor}18` }]}>
        <Text style={styles.cardIcon}>{icon}</Text>
        {/* XP ring over image */}
        <View style={styles.cardXpBadge}>
          <XPRing xp={sighting.xp} rarity={sighting.rarity} size={52} />
        </View>
      </View>

      {/* Card footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardName} numberOfLines={1}>
          {sighting.commonName}
        </Text>
        {sighting.scientificName ? (
          <Text style={styles.cardScientific} numberOfLines={1}>
            {sighting.scientificName}
          </Text>
        ) : null}
        <View style={styles.cardMeta}>
          <RarityBadge rarity={sighting.rarity} size="sm" />
          <Text style={styles.cardTime}>{relativeTime(sighting.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Single row in the Rare Nearby list. */
function NearbyRareRow({ hint, onPress }: { hint: NearbyRareHint; onPress: () => void }) {
  const rarityColor = rarityColors[hint.rarity];
  const icon = CATEGORY_ICON[hint.category] ?? '❔';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={styles.nearbyRow}
    >
      {/* Icon bubble */}
      <View style={[styles.nearbyIconBubble, { backgroundColor: `${rarityColor}22`, borderColor: `${rarityColor}55` }]}>
        <Text style={styles.nearbyIcon}>{icon}</Text>
      </View>

      {/* Name + distance */}
      <View style={styles.nearbyBody}>
        <Text style={styles.nearbyName} numberOfLines={1}>
          {hint.commonName}
        </Text>
        {hint.scientificName ? (
          <Text style={styles.nearbyScientific} numberOfLines={1}>
            {hint.scientificName}
          </Text>
        ) : null}
        <View style={styles.nearbyMeta}>
          <RarityBadge rarity={hint.rarity} size="sm" />
          <Text style={styles.nearbyDistance}>{formatDistance(hint.distanceMeters)} away</Text>
        </View>
      </View>

      {/* Arrow */}
      <Text style={styles.nearbyArrow}>›</Text>
    </TouchableOpacity>
  );
}

/** Stat chip used in the hero area. */
function StatChip({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statValue, accent ? { color: accent } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* HomeScreen                                                           */
/* ------------------------------------------------------------------ */

type HomeNavProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation<HomeNavProp>();
  const state = useLifeDexStore();

  const { profile } = state;
  const recentSightings = useMemo(() => selectRecentDiscoveries(state), [state]);
  const todayCount = useMemo(() => selectTodayCount(state), [state]);
  const totalSpecies = useMemo(() => selectTotalSpecies(state), [state]);

  const { currentLevelXp, xpForNextLevel, levelProgress } = useMemo(() => {
    const xpAtLevelStart = XP_PER_LEVEL * profile.level;
    const xpForNext = XP_PER_LEVEL * (profile.level + 1);
    const levelXpRange = xpForNext - xpAtLevelStart;
    const currentXp = profile.xp - xpAtLevelStart;
    return {
      currentLevelXp: currentXp,
      xpForNextLevel: levelXpRange,
      levelProgress: Math.min(1, Math.max(0, currentXp / levelXpRange)),
    };
  }, [profile]);

  const handleDiscoveryPress = useCallback(
    (cardId: string) => {
      navigation.navigate('CardDetail', { cardId });
    },
    [navigation],
  );

  const handleCapturePress = useCallback(() => {
    navigation.navigate('Tabs', { screen: 'Capture' });
  }, [navigation]);

  const handleNearbyPress = useCallback((_hintId: string) => {
    // In a real app: navigate to Map with the hint species focused
    navigation.navigate('Tabs', { screen: 'Map' });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Header bar ─────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>LIFEDEX</Text>
            <Text style={styles.subtitle}>Track · Collect · Protect</Text>
          </View>
          <TouchableOpacity
            onPress={handleCapturePress}
            style={styles.dailyBadge}
            activeOpacity={0.8}
          >
            <Text style={styles.dailyCount}>{todayCount}</Text>
            <Text style={styles.dailyLabel}>today</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hero: Level ring + stats ───────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroContent}>
            <LevelRing
              level={profile.level}
              currentXp={currentLevelXp}
              totalXp={xpForNextLevel}
              progress={levelProgress}
              size={180}
              strokeWidth={14}
            />

            {/* Stat chips beside the ring */}
            <View style={styles.heroStats}>
              <StatChip
                value={profile.xp.toLocaleString()}
                label="Total XP"
                accent={colors.teal}
              />
              <View style={styles.statDivider} />
              <StatChip
                value={String(totalSpecies)}
                label="Species"
              />
              <View style={styles.statDivider} />
              <StatChip
                value={String(
                  recentSightings.filter((s) =>
                    ['rare', 'epic', 'legendary'].includes(s.rarity),
                  ).length,
                )}
                label="Rare+"
                accent={rarityColors.rare}
              />
            </View>
          </View>

          {/* Capture CTA */}
          <TouchableOpacity
            style={styles.cta}
            onPress={handleCapturePress}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>＋  CAPTURE NOW</Text>
          </TouchableOpacity>
        </View>

        {/* ── Recent Discoveries carousel ─────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RECENT DISCOVERIES</Text>
            <Text style={styles.sectionCount}>{recentSightings.length}</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            {recentSightings.map((sighting) => (
              <DiscoveryCard
                key={sighting.id}
                sighting={sighting}
                onPress={() => handleDiscoveryPress(sighting.id)}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Rare Nearby teaser ──────────────────────────── */}
        {MOCK_NEARBY_RARE.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>RARE NEARBY</Text>
              <View style={styles.nearbyPing} />
            </View>
            <Text style={styles.nearbyHint}>
              These species have been spotted near you. Stay on paths. Do not disturb.
            </Text>
            <View style={styles.nearbyList}>
              {MOCK_NEARBY_RARE.map((hint) => (
                <NearbyRareRow
                  key={hint.id}
                  hint={hint}
                  onPress={() => handleNearbyPress(hint.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const CARD_WIDTH = 168;
const CARD_IMAGE_HEIGHT = 130;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  subtitle: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  dailyBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.teal + '66',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 60,
  },
  dailyCount: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: colors.teal,
    lineHeight: 26,
    textAlign: 'center',
  },
  dailyLabel: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
  },

  /* Hero */
  hero: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  heroStats: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginLeft: spacing.lg,
  },
  statChip: {
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  statValue: {
    ...typography.heading,
    color: colors.textPrimary,
    fontWeight: '800' as const,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 1,
  },
  statDivider: {
    height: 1,
    width: '60%',
    backgroundColor: colors.border,
  },
  cta: {
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: {
    ...typography.heading,
    color: colors.background,
    fontWeight: '800' as const,
    letterSpacing: 2,
  },

  /* Section wrapper */
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 2,
    fontWeight: '700' as const,
  },
  sectionCount: {
    ...typography.label,
    color: colors.textMuted,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 24,
    textAlign: 'center',
  },

  /* Discovery carousel */
  carousel: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  discoveryCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardAccent: {
    height: 3,
    width: '100%',
  },
  cardImageArea: {
    height: CARD_IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cardIcon: {
    fontSize: 56,
  },
  cardXpBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
  },
  cardFooter: {
    padding: spacing.sm + 2,
    gap: 3,
  },
  cardName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700' as const,
  },
  cardScientific: {
    ...typography.label,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  cardTime: {
    ...typography.label,
    color: colors.textMuted,
  },

  /* Nearby rare */
  nearbyPing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: rarityColors.rare,
    // Simulated pulse — static in RN without Animated, fine for MVP
  },
  nearbyHint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  nearbyList: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    gap: spacing.sm,
  },
  nearbyIconBubble: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nearbyIcon: {
    fontSize: 26,
  },
  nearbyBody: {
    flex: 1,
    gap: 3,
  },
  nearbyName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600' as const,
  },
  nearbyScientific: {
    ...typography.label,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  nearbyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  nearbyDistance: {
    ...typography.label,
    color: colors.textMuted,
  },
  nearbyArrow: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300' as const,
    flexShrink: 0,
  },

  bottomPad: {
    height: spacing.xl,
  },
});
