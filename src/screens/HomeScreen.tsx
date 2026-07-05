/**
 * HomeScreen — LifeDex main hub.
 *
 * Sections:
 *  1. Header bar — wordmark + subtitle + settings gear + today-count pill
 *  2. Hero — LevelRing driven by the store's quadratic ladder (levelBounds),
 *     borderless stat chips separated by hairlines
 *  3. Recent Discoveries — horizontal ScrollView carousel of sighting cards
 *  4. Rare Nearby — mock-only teaser list of nearby-rare species hints
 *
 * All data comes from useLifeDexStore (in-memory, no API keys required).
 * Navigation: tapping a discovery card pushes CardDetail; tapping Capture
 * navigates to the Capture tab; tapping the gear opens Settings.
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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LevelRing } from '@/components/LevelRing';
import { RarityBadge } from '@/components/RarityBadge';
import { SectionHeader } from '@/components/SectionHeader';
import { XPRing } from '@/components/XPRing';
import type { Rarity, Sighting } from '@/domain/types';
import {
  levelBounds,
  selectRecentDiscoveries,
  selectTodayCount,
  selectTotalSpecies,
  useLifeDexStore,
} from '@/store/useLifeDexStore';
import type { RootStackParamList } from '@/navigation/types';
import { env } from '@/config/env';
import {
  colors,
  gutter,
  radius,
  rarityColors,
  rarityTints,
  scrimGradient,
  spacing,
  typography,
} from '@/theme/theme';
import { haptics } from '@/utils/haptics';

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

/** FABRICATED data — only ever shown behind env.isMockAi. Never real. */
const MOCK_NEARBY_RARE: NearbyRareHint[] = [
  { id: 'nr1', commonName: 'Little Owl', scientificName: 'Athene noctua', rarity: 'rare', distanceMeters: 340, category: 'animal' },
  { id: 'nr2', commonName: "Lady's Slipper Orchid", scientificName: 'Cypripedium calceolus', rarity: 'legendary', distanceMeters: 870, category: 'plant' },
  { id: 'nr3', commonName: 'Ghost Orchid Fungus', scientificName: 'Epipogium aphyllum', rarity: 'legendary', distanceMeters: 1200, category: 'mushroom' },
];

/* ------------------------------------------------------------------ */
/* Category icons (Ionicons — no emoji in chrome)                      */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  animal: 'paw-outline',
  plant: 'flower-outline',
  tree: 'leaf-outline',
  mushroom: 'nutrition-outline',
  unknown: 'help-outline',
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
  const icon = CATEGORY_ICON[sighting.category] ?? 'help-outline';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.discoveryCard, pressed && styles.cardPressed]}
    >
      {/* Card image area — rarity tint + icon + bottom scrim */}
      <View style={[styles.cardImageArea, { backgroundColor: rarityTints[sighting.rarity] }]}>
        <Ionicons name={icon} size={44} color={rarityColor} />
        <LinearGradient colors={[...scrimGradient]} style={styles.cardScrim} pointerEvents="none" />
        {/* XP ring over image */}
        <View style={styles.cardXpBadge}>
          <XPRing xp={sighting.xp} rarity={sighting.rarity} size={48} />
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
  const icon = CATEGORY_ICON[hint.category] ?? 'help-outline';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.nearbyRow}>
      {/* Icon bubble */}
      <View style={[styles.nearbyIconBubble, { backgroundColor: rarityTints[hint.rarity] }]}>
        <Ionicons name={icon} size={24} color={rarityColor} />
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
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

/** Borderless stat cell used in the hero area — value + uppercase label. */
function StatCell({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? { color: accent } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** "Simulated" chip shown next to fabricated section headers. */
function SimulatedChip() {
  return (
    <View style={styles.simulatedChip}>
      <Text style={styles.simulatedChipText}>Simulated</Text>
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

  const lb = useMemo(() => levelBounds(profile.xp), [profile.xp]);

  const handleDiscoveryPress = useCallback(
    (cardId: string) => {
      navigation.navigate('CardDetail', { cardId });
    },
    [navigation],
  );

  const handleCapturePress = useCallback(() => {
    navigation.navigate('Tabs', { screen: 'Capture' });
  }, [navigation]);

  const handleNearbyPress = useCallback(
    (_hintId: string) => {
      // In a real app: navigate to Map with the hint species focused
      navigation.navigate('Tabs', { screen: 'Map' });
    },
    [navigation],
  );

  const handleSettingsPress = useCallback(() => {
    haptics.tap();
    navigation.navigate('Settings');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Header bar ─────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.wordmark}>LifeDex</Text>
            <Text style={styles.subtitle}>Track · Collect · Protect</Text>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.todayPill}>
              <Text style={styles.todayCount}>{todayCount}</Text>
              <Text style={styles.todayLabel}>today</Text>
            </View>
            <Pressable
              onPress={handleSettingsPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={({ pressed }) => [styles.gearButton, pressed && styles.gearButtonPressed]}
            >
              <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* ── Hero: Level ring + stats ───────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroContent}>
            <LevelRing
              level={lb.level}
              currentXp={profile.xp - lb.floor}
              totalXp={lb.ceil - lb.floor}
              progress={lb.progress}
              size={158}
              strokeWidth={13}
            />
            <Text style={styles.toNextCaption}>
              {lb.toNext.toLocaleString()} XP to level {lb.level + 1}
            </Text>
          </View>

          {/* Stat cells — borderless, hairline separated */}
          <View style={styles.statsRow}>
            <StatCell value={String(totalSpecies)} label="Species" />
            <View style={styles.statDivider} />
            <StatCell value={String(todayCount)} label="Today" />
            <View style={styles.statDivider} />
            <StatCell value={profile.xp.toLocaleString()} label="Total XP" accent={colors.accent} />
          </View>

          {/* Capture CTA */}
          <Button
            title="Capture"
            variant="primary"
            size="lg"
            icon="camera"
            fullWidth
            onPress={handleCapturePress}
            style={styles.ctaButton}
          />
        </View>

        {/* ── Recent Discoveries carousel ─────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent discoveries"
            accessory={<Text style={styles.sectionCount}>{recentSightings.length}</Text>}
          />

          {recentSightings.length > 0 ? (
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
          ) : (
            <EmptyState
              icon="leaf-outline"
              title="No discoveries yet"
              message="Your first catch is waiting outside."
              actionTitle="Open camera"
              onAction={handleCapturePress}
            />
          )}
        </View>

        {/* ── Rare Nearby teaser (mock-only — fabricated data) ────── */}
        {env.isMockAi && MOCK_NEARBY_RARE.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Rare nearby" accessory={<SimulatedChip />} />
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
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerText: {
    flexShrink: 1,
  },
  wordmark: {
    ...typography.title1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  todayCount: {
    ...typography.callout,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.textPrimary,
    fontWeight: '700' as const,
  },
  todayLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearButtonPressed: {
    backgroundColor: colors.surfaceElevated,
  },

  /* Hero */
  hero: {
    backgroundColor: colors.surface,
    marginHorizontal: gutter,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  heroContent: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  toNextCaption: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.title2,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.separator,
    marginHorizontal: spacing.sm,
  },
  ctaButton: {
    marginTop: 0,
  },

  /* Section wrapper */
  section: {
    marginBottom: spacing.lg,
  },
  sectionCount: {
    ...typography.label,
    color: colors.textTertiary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 24,
    textAlign: 'center',
    overflow: 'hidden',
  },

  /* Discovery carousel */
  carousel: {
    paddingHorizontal: gutter,
    gap: spacing.sm,
  },
  discoveryCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardImageArea: {
    height: CARD_IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
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
    ...typography.headline,
    color: colors.textPrimary,
  },
  cardScientific: {
    ...typography.footnote,
    color: colors.textTertiary,
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
    color: colors.textTertiary,
  },

  /* Rare nearby */
  simulatedChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  simulatedChipText: {
    ...typography.label,
    color: colors.textTertiary,
  },
  nearbyHint: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: gutter,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  nearbyList: {
    paddingHorizontal: gutter,
    gap: spacing.sm,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    gap: spacing.sm,
  },
  nearbyIconBubble: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    color: colors.textTertiary,
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
    color: colors.textTertiary,
  },

  bottomPad: {
    height: spacing.xl,
  },
});
