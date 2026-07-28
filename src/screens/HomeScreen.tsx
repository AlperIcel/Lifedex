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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
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
import {
  dailyQuestsFor,
  dayKeyOf,
  speciesOfTheDay,
  DAILY_REWARD_XP,
  type DailyQuest,
  type DailyQuestId,
} from '@/domain/dailyQuests';
import type { Rarity, Sighting } from '@/domain/types';
import { useT } from '@/i18n';
import {
  levelBounds,
  selectRecentDiscoveries,
  selectTodayCount,
  selectTotalSpecies,
  useLifeDexStore,
} from '@/store/useLifeDexStore';
import { loadStreakMeta } from '@/store/persistence';
import type { RootStackParamList } from '@/navigation/types';
import { env } from '@/config/env';
import { useSettings, formatDistance } from '@/store/settings';
import {
  colors,
  elevation,
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
/* i18n — English values stay byte-identical to the originals          */
/* (HomeScreen.test.tsx asserts several verbatim); German added        */
/* alongside. Shared by every component in this file.                  */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    subtitle: 'Track · Collect · Protect',
    today: 'today',
    settings: 'Settings',
    toNextCaption: '{toNext} XP to level {level}',
    statSpecies: 'Species',
    statToday: 'Today',
    statTotalXp: 'Total XP',
    capture: 'Capture',
    recentDiscoveries: 'Recent discoveries',
    noDiscoveriesTitle: 'No discoveries yet',
    noDiscoveriesMessage: 'Your first catch is waiting outside.',
    openCamera: 'Open camera',
    rareNearby: 'Rare nearby',
    simulated: 'Simulated',
    nearbyHint: 'These species have been spotted near you. Stay on paths. Do not disturb.',
    away: '{distance} away',
    photoOf: 'Photo of {name}',
    minsAgo: '{mins}m ago',
    hrsAgo: '{hrs}h ago',
    daysAgo: '{days}d ago',
    streakA11y: '{count} day streak',

    // Daily loop ("Today" card) — quests, species of the day, claimable reward.
    dailyQuestsTitle: 'Daily Quests',
    questProgress: '{current}/{target}',
    questDoneA11y: 'done',
    questInProgressA11y: 'in progress',
    questSpecies3: 'Catch 3 species today',
    questCategoryAnimal: 'Catch an animal today',
    questCategoryPlant: 'Catch a plant today',
    questCategoryTree: 'Catch a tree today',
    questCategoryMushroom: 'Catch a mushroom today',
    questRareOrNew: 'Catch something rare or new',
    questVolume5: 'Log 5 sightings today',
    questWild1: 'Catch something wild',
    speciesOfDay: 'Species of the Day',
    speciesOfDayA11y: 'Species of the Day: {name}. Tap to go find it.',
    claimReward: 'Claim +{xp} XP',
    rewardClaimed: 'Reward claimed',
    completeQuestsFirst: '{done}/{total} quests done',
  },
  de: {
    subtitle: 'Erfassen · Sammeln · Schützen',
    today: 'heute',
    settings: 'Einstellungen',
    toNextCaption: '{toNext} XP bis Level {level}',
    statSpecies: 'Arten',
    statToday: 'Heute',
    statTotalXp: 'Gesamt-XP',
    capture: 'Fangen',
    recentDiscoveries: 'Neueste Entdeckungen',
    noDiscoveriesTitle: 'Noch keine Entdeckungen',
    noDiscoveriesMessage: 'Dein erster Fang wartet draußen.',
    openCamera: 'Kamera öffnen',
    rareNearby: 'Selten in der Nähe',
    simulated: 'Simuliert',
    nearbyHint: 'Diese Arten wurden in deiner Nähe gesichtet. Bleib auf den Wegen. Nicht stören.',
    away: '{distance} entfernt',
    photoOf: 'Foto von {name}',
    minsAgo: 'vor {mins}m',
    hrsAgo: 'vor {hrs}h',
    daysAgo: 'vor {days}d',
    streakA11y: '{count} Tage Serie',

    // Daily loop ("Heute"-Karte) — Tagesquests, Art des Tages, abholbare Belohnung.
    dailyQuestsTitle: 'Tagesaufgaben',
    questProgress: '{current}/{target}',
    questDoneA11y: 'erledigt',
    questInProgressA11y: 'in Arbeit',
    questSpecies3: 'Fang heute 3 Arten',
    questCategoryAnimal: 'Fang heute ein Tier',
    questCategoryPlant: 'Fang heute eine Pflanze',
    questCategoryTree: 'Fang heute einen Baum',
    questCategoryMushroom: 'Fang heute einen Pilz',
    questRareOrNew: 'Fang etwas Seltenes oder Neues',
    questVolume5: 'Erfasse heute 5 Sichtungen',
    questWild1: 'Fang etwas Wildes',
    speciesOfDay: 'Art des Tages',
    speciesOfDayA11y: 'Art des Tages: {name}. Tippen, um sie zu suchen.',
    claimReward: '+{xp} XP abholen',
    rewardClaimed: 'Belohnung abgeholt',
    completeQuestsFirst: '{done}/{total} Quests geschafft',
  },
} as const;

type TFunc = (key: keyof typeof C.en, vars?: Record<string, string | number>) => string;

/* ------------------------------------------------------------------ */
/* Daily quest display maps — the domain layer (dailyQuests.ts) stays  */
/* string-free; this screen owns the icon + title lookup by stable id, */
/* same convention as achievements.ts / StatsScreen's ACHIEVEMENT_COPY_KEYS. */
/* ------------------------------------------------------------------ */

const QUEST_ICON: Record<DailyQuestId, keyof typeof Ionicons.glyphMap> = {
  'species-3': 'compass-outline',
  'category-animal': 'paw-outline',
  'category-plant': 'flower-outline',
  'category-tree': 'leaf-outline',
  'category-mushroom': 'nutrition-outline',
  'rare-or-new': 'sparkles-outline',
  'volume-5': 'albums-outline',
  'wild-1': 'trail-sign-outline',
};

const QUEST_TITLE_KEY: Record<DailyQuestId, keyof typeof C.en> = {
  'species-3': 'questSpecies3',
  'category-animal': 'questCategoryAnimal',
  'category-plant': 'questCategoryPlant',
  'category-tree': 'questCategoryTree',
  'category-mushroom': 'questCategoryMushroom',
  'rare-or-new': 'questRareOrNew',
  'volume-5': 'questVolume5',
  'wild-1': 'questWild1',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function relativeTime(isoString: string, t: TFunc): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return t('minsAgo', { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('hrsAgo', { hrs });
  const days = Math.floor(hrs / 24);
  return t('daysAgo', { days });
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                        */
/* ------------------------------------------------------------------ */

/** Single card in the Recent Discoveries horizontal carousel. */
function DiscoveryCard({ sighting, onPress }: { sighting: Sighting; onPress: () => void }) {
  const t = useT(C);
  const rarityColor = rarityColors[sighting.rarity];
  const icon = CATEGORY_ICON[sighting.category] ?? 'help-outline';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.discoveryCard, pressed && styles.cardPressed]}
    >
      {/* Card image area — the real captured crop when available, else a
          rarity-tinted category icon. Never renders the private original: this
          is publicImageUri (an on-device subject crop), or a mock placeholder. */}
      <View style={[styles.cardImageArea, { backgroundColor: rarityTints[sighting.rarity] }]}>
        {sighting.publicImageUri.length > 0 &&
        !sighting.publicImageUri.startsWith('mock-card://') ? (
          <Image
            source={{ uri: sighting.publicImageUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityLabel={t('photoOf', { name: sighting.commonName })}
          />
        ) : (
          <Ionicons name={icon} size={44} color={rarityColor} />
        )}
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
          <Text style={styles.cardTime}>{relativeTime(sighting.createdAt, t)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Single row in the Rare Nearby list. */
function NearbyRareRow({ hint, onPress }: { hint: NearbyRareHint; onPress: () => void }) {
  const t = useT(C);
  const { units } = useSettings();
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
          <Text style={styles.nearbyDistance}>
            {t('away', { distance: formatDistance(hint.distanceMeters, units) })}
          </Text>
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
  const t = useT(C);
  return (
    <View style={styles.simulatedChip}>
      <Text style={styles.simulatedChipText}>{t('simulated')}</Text>
    </View>
  );
}

/** One row in the "Today" card's quest list — icon, title, progress bar. */
function DailyQuestRow({ quest }: { quest: DailyQuest }) {
  const t = useT(C);
  const title = t(QUEST_TITLE_KEY[quest.id]);
  const icon = QUEST_ICON[quest.id];
  // Small visible sliver once progress starts (matches StatsScreen's achievement bars).
  const pct =
    quest.target > 0
      ? Math.max(quest.current > 0 ? 6 : 0, Math.min(100, (quest.current / quest.target) * 100))
      : 0;

  return (
    <View
      style={styles.questRow}
      accessible
      accessibilityLabel={`${title}. ${t('questProgress', {
        current: quest.current,
        target: quest.target,
      })}. ${quest.done ? t('questDoneA11y') : t('questInProgressA11y')}`}
    >
      <View style={[styles.questIconBubble, quest.done && styles.questIconBubbleDone]}>
        <Ionicons name={icon} size={18} color={quest.done ? colors.accent : colors.textSecondary} />
      </View>
      <View style={styles.questBody}>
        <View style={styles.questTitleRow}>
          <Text style={[styles.questTitle, quest.done && styles.questTitleDone]} numberOfLines={1}>
            {title}
          </Text>
          {quest.done ? (
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          ) : (
            <Text style={styles.questProgressText}>
              {t('questProgress', { current: quest.current, target: quest.target })}
            </Text>
          )}
        </View>
        <View style={styles.questTrack}>
          <View
            style={[styles.questFill, { width: `${pct}%` }, quest.done && styles.questFillDone]}
          />
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* HomeScreen                                                           */
/* ------------------------------------------------------------------ */

type HomeNavProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation<HomeNavProp>();
  const t = useT(C);
  const state = useLifeDexStore();

  const { profile, claimDailyReward } = state;
  const recentSightings = useMemo(() => selectRecentDiscoveries(state), [state]);
  const todayCount = useMemo(() => selectTodayCount(state), [state]);
  const totalSpecies = useMemo(() => selectTotalSpecies(state), [state]);

  const lb = useMemo(() => levelBounds(profile.xp), [profile.xp]);

  // ── Daily loop: quests, Species of the Day, claimable reward ─────────
  // dayKey is real wall-clock (Date.now(), like selectTodayCount) — allowed
  // here per project convention; only the domain layer must stay pure.
  const todayKey = dayKeyOf(new Date().toISOString());
  const quests = useMemo(
    () => dailyQuestsFor(todayKey, state.sightings),
    [todayKey, state.sightings],
  );
  const speciesToday = useMemo(() => speciesOfTheDay(todayKey), [todayKey]);
  const doneCount = quests.filter((q) => q.done).length;
  const allQuestsDone = quests.length > 0 && doneCount === quests.length;
  const alreadyClaimedToday = state.dailyRewardClaimedDayKey === todayKey;
  // Design decision: the claim button is enabled ONLY when every quest is
  // done AND today hasn't been claimed yet — it becomes the "collect" step of
  // a complete-then-claim loop rather than a passive XP trickle. Once claimed
  // it flips to a disabled "claimed" state for the rest of the day; while any
  // quest is open it shows a live done-count so the lock reads as progress,
  // not a dead end.
  const canClaimToday = allQuestsDone && !alreadyClaimedToday;

  const claimLabel = alreadyClaimedToday
    ? t('rewardClaimed')
    : allQuestsDone
      ? t('claimReward', { xp: DAILY_REWARD_XP })
      : t('completeQuestsFirst', { done: doneCount, total: quests.length });

  const claimIcon: keyof typeof Ionicons.glyphMap = alreadyClaimedToday
    ? 'checkmark-circle'
    : allQuestsDone
      ? 'gift'
      : 'lock-closed-outline';

  // Daily-streak flame — read-only display; nothing here writes streak state.
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const meta = await loadStreakMeta();
      if (active) setStreak(meta.streak);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleDiscoveryPress = useCallback(
    (sightingId: string) => {
      // CardDetail resolves via getCardById; card ids follow `card-<sightingId>`.
      navigation.navigate('CardDetail', { cardId: `card-${sightingId}` });
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

  const handleClaimPress = useCallback(() => {
    const result = claimDailyReward(todayKey);
    if (result.claimed) haptics.success();
  }, [claimDailyReward, todayKey]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Header bar ─────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.wordmark}>LifeDex</Text>
            <Text style={styles.subtitle}>{t('subtitle')}</Text>
          </View>

          <View style={styles.headerActions}>
            {streak > 0 && (
              <View
                style={styles.streakPill}
                accessible
                accessibilityLabel={t('streakA11y', { count: streak })}
              >
                <Ionicons name="flame" size={14} color={colors.warning} />
                <Text style={styles.streakCount}>{streak}</Text>
              </View>
            )}
            <View style={styles.todayPill}>
              <Text style={styles.todayCount}>{todayCount}</Text>
              <Text style={styles.todayLabel}>{t('today')}</Text>
            </View>
            <Pressable
              onPress={handleSettingsPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('settings')}
              style={({ pressed }) => [styles.gearButton, pressed && styles.gearButtonPressed]}
            >
              <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* ── Today: daily quests + Species of the Day + claim ────── */}
        <View style={styles.todayCard}>
          <View style={styles.todayHeaderRow}>
            <Text style={styles.todayTitle}>{t('dailyQuestsTitle')}</Text>
            <Text style={styles.todayBadge}>
              {t('questProgress', { current: doneCount, target: quests.length })}
            </Text>
          </View>

          <View style={styles.questList}>
            {quests.map((quest) => (
              <DailyQuestRow key={quest.id} quest={quest} />
            ))}
          </View>

          <View style={styles.todayDivider} />

          <Pressable
            onPress={handleCapturePress}
            style={({ pressed }) => [styles.speciesRow, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('speciesOfDayA11y', { name: speciesToday.name })}
          >
            <View style={styles.speciesIconBubble}>
              <Ionicons name="sparkles" size={22} color={colors.amber} />
            </View>
            <View style={styles.speciesBody}>
              <Text style={styles.speciesLabel}>{t('speciesOfDay')}</Text>
              <Text style={styles.speciesName} numberOfLines={1}>
                {speciesToday.name}
              </Text>
              {speciesToday.scientificName ? (
                <Text style={styles.speciesScientific} numberOfLines={1}>
                  {speciesToday.scientificName}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Pressable>

          <Button
            title={claimLabel}
            variant={!alreadyClaimedToday && allQuestsDone ? 'primary' : 'secondary'}
            icon={claimIcon}
            fullWidth
            disabled={!canClaimToday}
            onPress={handleClaimPress}
            style={styles.claimButton}
          />
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
              {t('toNextCaption', { toNext: lb.toNext.toLocaleString(), level: lb.level + 1 })}
            </Text>
          </View>

          {/* Stat cells — borderless, hairline separated */}
          <View style={styles.statsRow}>
            <StatCell value={String(totalSpecies)} label={t('statSpecies')} />
            <View style={styles.statDivider} />
            <StatCell value={String(todayCount)} label={t('statToday')} />
            <View style={styles.statDivider} />
            <StatCell value={profile.xp.toLocaleString()} label={t('statTotalXp')} accent={colors.accent} />
          </View>

          {/* Capture CTA */}
          <Button
            title={t('capture')}
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
            title={t('recentDiscoveries')}
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
              title={t('noDiscoveriesTitle')}
              message={t('noDiscoveriesMessage')}
              actionTitle={t('openCamera')}
              onAction={handleCapturePress}
            />
          )}
        </View>

        {/* ── Rare Nearby teaser (mock-only — fabricated data) ────── */}
        {env.isMockAi && MOCK_NEARBY_RARE.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={t('rareNearby')} accessory={<SimulatedChip />} />
            <Text style={styles.nearbyHint}>{t('nearbyHint')}</Text>
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
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  streakCount: {
    ...typography.callout,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.warning,
    fontWeight: '700' as const,
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

  /* Today card (daily quests + Species of the Day + claim) */
  todayCard: {
    backgroundColor: colors.surface,
    marginHorizontal: gutter,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...elevation.level1,
  },
  todayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  todayTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  todayBadge: {
    ...typography.label,
    color: colors.textTertiary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    ...{ fontVariant: ['tabular-nums'] as const },
  },
  questList: {
    gap: spacing.sm + 4,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  questIconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    flexShrink: 0,
  },
  questIconBubbleDone: {
    backgroundColor: colors.accentSubtle,
  },
  questBody: {
    flex: 1,
    gap: 4,
  },
  questTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  questTitle: {
    ...typography.callout,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  questTitleDone: {
    color: colors.textSecondary,
  },
  questProgressText: {
    ...typography.label,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.textTertiary,
  },
  questTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  questFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  questFillDone: {
    backgroundColor: colors.success,
  },
  todayDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginVertical: spacing.md,
  },
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  speciesIconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rarityTints.legendary,
    flexShrink: 0,
  },
  speciesBody: {
    flex: 1,
    gap: 2,
  },
  speciesLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  speciesName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600' as const,
  },
  speciesScientific: {
    ...typography.footnote,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  claimButton: {
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
