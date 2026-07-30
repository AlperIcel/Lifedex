/**
 * LabScreen — the Solo Lab: the player's field research bench.
 *
 * NOT a fake community — a single-player utility screen. Sections:
 *   1. Header hero — flask icon, RP balance + vial count, level.
 *   2. Weekly research focus — visible only with the Lab Pass gadget, else a
 *      locked teaser tile (price/level).
 *   3. Sample bench (Probenbank) — filed samples newest-first, tap -> CardDetail.
 *   4. Equipment/Shop — vial SKU + two gadgets, price/level-gated, owned check.
 *   5. Community panel — copy only ("coming in v1.1"), no counters, no buttons.
 *
 * Route: RootStackParamList['Lab'] (no params) — pushed next to SpeciesOfDay,
 * NOT a tab (the 5-tab bar is untouched). Entry points: ResultScreen's Solo
 * Lab banner + a flask-outline affordance on HomeScreen's Today card.
 *
 * Zero network I/O — everything here reads/writes only the local lab store
 * (src/store/lab.ts) and the local lifeDexStore. Respects useReduceMotion()
 * (skips the entrance fade/rise) and RN Animated + useNativeDriver only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { AchievementToast } from '@/components/AchievementToast';
import { MockCardImage } from '@/components/MockCardImage';
import { RarityBadge } from '@/components/RarityBadge';
import { SectionHeader } from '@/components/SectionHeader';
import { Button } from '@/components/Button';
import { buildDex, type DexSightingRow } from '@/domain/dexGrouping';
import { LAB_TUNING, labFocusForWeek, weekKeyOf, type GadgetId, type LabSample } from '@/domain/lab';
import type { Category } from '@/domain/types';
import { useCommon, useT } from '@/i18n';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { RootStackParamList } from '@/navigation/types';
import { labStore, useLabStore } from '@/store/lab';
import { useLifeDexStore, type CollectionCard } from '@/store/useLifeDexStore';
import {
  colors,
  gutter,
  motion,
  numeric,
  radius,
  rarityColors,
  rarityTints,
  spacing,
  typography,
} from '@/theme/theme';
import { haptics } from '@/utils/haptics';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Props = NativeStackScreenProps<RootStackParamList, 'Lab'>;

/* ------------------------------------------------------------------ */
/* i18n                                                                 */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    back: 'Back',
    title: 'The Lab',
    rpLabel: 'Research points',
    vialsLabel: 'Sample vials',
    levelLabel: 'Level',
    focusTitle: 'This week the Lab seeks',
    focusBonus: 'Double research points',
    benchTitle: 'Sample bench',
    benchMeter: '{found} special finds · {sampled} sampled',
    benchEmptyTitle: 'No samples yet',
    benchEmptyBody:
      'Catch a species outside the catalogue — a special find — to file your first sample.',
    observationsLine: 'Only ~{count} records worldwide',
    shopTitle: 'Equipment',
    buyForRp: 'Buy · {rp} RP',
    owned: 'Owned',
    lockedUntilLevel: 'Unlocks at level {level}',
    vialSku: 'Sample vial',
    gadgetLaborPass: 'Lab Pass',
    gadgetLaborPassDesc: 'Weekly research focus: double points for the sought category',
    gadgetMakroLinse: 'Macro Lens',
    gadgetMakroLinseDesc: '+15% XP on small subjects — insects, snails, mushrooms',
    communityTeaserTitle: 'Community research — coming in v1.1',
    communityTeaserBody:
      'When the community launches, shared samples can graduate species into the official catalogue. Your filed samples are timestamped.',
  },
  de: {
    back: 'Zurück',
    title: 'Das Labor',
    rpLabel: 'Forschungspunkte',
    vialsLabel: 'Probenröhrchen',
    levelLabel: 'Level',
    focusTitle: 'Diese Woche sucht das Labor',
    focusBonus: 'Doppelte Forschungspunkte',
    benchTitle: 'Probenbank',
    benchMeter: '{found} Besondere Funde · {sampled} eingereicht',
    benchEmptyTitle: 'Noch keine Proben',
    benchEmptyBody:
      'Fang eine Art außerhalb des Katalogs — einen Besonderen Fund — um deine erste Probe abzulegen.',
    observationsLine: 'Weltweit nur ~{count} Beobachtungen',
    shopTitle: 'Ausrüstung',
    buyForRp: 'Kaufen · {rp} FP',
    owned: 'Im Besitz',
    lockedUntilLevel: 'Ab Level {level}',
    vialSku: 'Probenröhrchen',
    gadgetLaborPass: 'Labor-Pass',
    gadgetLaborPassDesc: 'Wöchentlicher Forschungsauftrag: doppelte Punkte für die gesuchte Kategorie',
    gadgetMakroLinse: 'Makro-Linse',
    gadgetMakroLinseDesc: '+15% XP bei kleinen Motiven — Insekten, Schnecken, Pilze',
    communityTeaserTitle: 'Gemeinsame Forschung — kommt in v1.1',
    communityTeaserBody:
      'Wenn die Community startet, können gemeinsame Proben Arten in den offiziellen Katalog aufnehmen. Deine eingereichten Proben sind mit Zeitstempel gesichert.',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Icon lookups — this screen owns its own icon choice by stable id,    */
/* same convention as HomeScreen's CATEGORY_ICON / achievementLabels.ts */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  animal: 'paw-outline',
  plant: 'flower-outline',
  tree: 'leaf-outline',
  mushroom: 'nutrition-outline',
  unknown: 'help-outline',
};

const GADGET_ICON: Record<GadgetId, keyof typeof Ionicons.glyphMap> = {
  'labor-pass': 'newspaper-outline',
  'makro-linse': 'search-outline',
};

const tabularNums = { fontVariant: [...numeric.fontVariant] };

/* ------------------------------------------------------------------ */
/* Sample bench row                                                     */
/* ------------------------------------------------------------------ */

function SampleRow({
  sample,
  card,
  onPress,
}: {
  sample: LabSample;
  card: CollectionCard | undefined;
  onPress: () => void;
}): React.JSX.Element {
  const t = useT(C);
  const rarityColor = rarityColors[sample.rarity];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sampleRow, pressed && styles.samplePressed]}
    >
      <View style={[styles.sampleThumb, { backgroundColor: rarityTints[sample.rarity] }]}>
        {card !== undefined ? (
          <MockCardImage
            uri={card.publicImageUri}
            rarity={sample.rarity}
            category={sample.category}
            name={sample.commonName}
          />
        ) : (
          <Ionicons name={CATEGORY_ICON[sample.category]} size={22} color={rarityColor} />
        )}
      </View>
      <View style={styles.sampleBody}>
        <Text style={styles.sampleName} numberOfLines={1}>
          {sample.commonName}
        </Text>
        {sample.scientificName !== undefined && (
          <Text style={styles.sampleScientific} numberOfLines={1}>
            {sample.scientificName}
          </Text>
        )}
        <View style={styles.sampleMetaRow}>
          <RarityBadge rarity={sample.rarity} size="sm" />
          {sample.observationsCount !== undefined && (
            <Text style={styles.sampleObservations} numberOfLines={1}>
              {t('observationsLine', { count: sample.observationsCount.toLocaleString() })}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Shop row                                                             */
/* ------------------------------------------------------------------ */

function ShopRow({
  icon,
  name,
  description,
  rightSlot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  description?: string;
  rightSlot: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.shopRow}>
      <View style={styles.shopIconWrap}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.shopBody}>
        <Text style={styles.shopName} numberOfLines={1}>
          {name}
        </Text>
        {description !== undefined && (
          <Text style={styles.shopDesc} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>
      <View style={styles.shopRight}>{rightSlot}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

export function LabScreen({ navigation }: Props): React.JSX.Element {
  const t = useT(C);
  const common = useCommon();
  const reduceMotion = useReduceMotion();
  const lab = useLabStore();
  const store = useLifeDexStore();
  const { profile, collectionCards } = store;

  /* ---- Entrance fade/rise — purely decorative, skipped under reduced motion ---- */
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    Animated.timing(fade, {
      toValue: 1,
      duration: motion.duration.slow,
      easing: motion.easing.decel,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, fade]);

  /* ---- Lab-achievement unlock toast — read-and-clear once on mount, same
     one-shot pattern as ResultScreen's own achievement toast, but entirely
     independent of it (never competes with ResultScreen's level-up/achievement
     sequencing). ---- */
  const [pendingAchievementIds, setPendingAchievementIds] = useState<string[]>([]);
  const [achievementToastVisible, setAchievementToastVisible] = useState(false);
  useEffect(() => {
    const ids = labStore.consumeAchievements();
    if (ids.length > 0) {
      setPendingAchievementIds(ids);
      setAchievementToastVisible(true);
    }
  }, []);
  const handleAchievementToastDone = useCallback(() => setAchievementToastVisible(false), []);
  const handleAchievementRowRevealed = useCallback(() => haptics.success(), []);

  /* ---- Weekly research focus ---- */
  const weekKey = useMemo(() => weekKeyOf(new Date().toISOString()), []);
  const focusCategory = useMemo(() => labFocusForWeek(weekKey), [weekKey]);
  const hasLaborPass = lab.ownedGadgets.includes('labor-pass');
  const laborPassDef = LAB_TUNING.gadgets['labor-pass'];

  /* ---- Sample bench meter: found (bonus/uncatalogued catches) vs sampled ---- */
  const allRows = useMemo<DexSightingRow[]>(() => {
    return collectionCards.reduce<DexSightingRow[]>((acc, card) => {
      const sighting = store.getSightingById(card.sightingId);
      if (sighting !== undefined) acc.push({ cardId: card.id, sighting });
      return acc;
    }, []);
  }, [collectionCards, store]);
  const dex = useMemo(() => buildDex(allRows), [allRows]);
  const found = useMemo(() => dex.sections.reduce((sum, s) => sum + s.bonusCaught, 0), [dex]);
  const sampled = lab.samples.length;

  /* ---- Handlers ---- */
  const handleBack = useCallback(() => {
    haptics.tap();
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const handleBuyVial = useCallback(() => {
    const result = labStore.buyVial();
    if (result.ok) haptics.success();
    else haptics.error();
  }, []);

  const handleBuyGadget = useCallback((id: GadgetId) => {
    const result = labStore.buyGadget(id);
    if (result.ok) haptics.success();
    else haptics.error();
  }, []);

  const handleSamplePress = useCallback(
    (sightingId: string) => {
      navigation.navigate('CardDetail', { cardId: `card-${sightingId}` });
    },
    [navigation],
  );

  const translateY = fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Back button ── */}
        <View style={styles.topBar}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <Animated.View style={{ opacity: fade, transform: [{ translateY }] }}>
          {/* ── 1. Header hero ── */}
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="flask" size={30} color={colors.accent} />
            </View>
            <Text style={styles.heroTitle}>{t('title')}</Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, tabularNums]}>{lab.researchPoints}</Text>
                <Text style={styles.heroStatLabel}>{t('rpLabel')}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, tabularNums]}>{lab.vials}</Text>
                <Text style={styles.heroStatLabel}>{t('vialsLabel')}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, tabularNums]}>{profile.level}</Text>
                <Text style={styles.heroStatLabel}>{t('levelLabel')}</Text>
              </View>
            </View>
          </View>

          {/* ── 2. Weekly research focus ── */}
          <SectionHeader title={t('focusTitle')} />
          {hasLaborPass ? (
            <View style={styles.focusTile}>
              <View style={[styles.focusIconWrap, { backgroundColor: rarityTints.epic }]}>
                <Ionicons name={CATEGORY_ICON[focusCategory]} size={22} color={rarityColors.epic} />
              </View>
              <View style={styles.focusBody}>
                <Text style={styles.focusCategory}>{common.category(focusCategory)}</Text>
                <Text style={styles.focusBonus}>{t('focusBonus')}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.lockedTile}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
              <View style={styles.lockedBody}>
                <Text style={styles.lockedTitle}>{t('gadgetLaborPass')}</Text>
                <Text style={styles.lockedDesc}>{t('gadgetLaborPassDesc')}</Text>
              </View>
              <Text style={styles.lockedMeta}>
                {profile.level < laborPassDef.minLevel
                  ? t('lockedUntilLevel', { level: laborPassDef.minLevel })
                  : t('buyForRp', { rp: laborPassDef.priceRp })}
              </Text>
            </View>
          )}

          {/* ── 3. Sample bench (Probenbank) ── */}
          <SectionHeader
            title={t('benchTitle')}
            accessory={
              <Text style={styles.benchMeterText}>{t('benchMeter', { found, sampled })}</Text>
            }
          />
          {lab.samples.length === 0 ? (
            <View style={styles.benchEmpty}>
              <Ionicons name="flask-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.benchEmptyTitle}>{t('benchEmptyTitle')}</Text>
              <Text style={styles.benchEmptyBody}>{t('benchEmptyBody')}</Text>
            </View>
          ) : (
            <View style={styles.benchList}>
              {lab.samples.map((sample) => (
                <SampleRow
                  key={sample.sightingId}
                  sample={sample}
                  card={store.getCardById(`card-${sample.sightingId}`)}
                  onPress={() => handleSamplePress(sample.sightingId)}
                />
              ))}
            </View>
          )}

          {/* ── 4. Equipment / Shop ── */}
          <SectionHeader title={t('shopTitle')} />
          <View style={styles.shopList}>
            <ShopRow
              icon="flask-outline"
              name={t('vialSku')}
              rightSlot={
                <Button
                  title={t('buyForRp', { rp: LAB_TUNING.vialPriceRp })}
                  onPress={handleBuyVial}
                  variant="secondary"
                  size="sm"
                  disabled={lab.researchPoints < LAB_TUNING.vialPriceRp}
                />
              }
            />

            {(Object.keys(LAB_TUNING.gadgets) as GadgetId[]).map((id) => {
              const def = LAB_TUNING.gadgets[id];
              const owned = lab.ownedGadgets.includes(id);
              const lockedByLevel = profile.level < def.minLevel;
              const titleKey = id === 'labor-pass' ? 'gadgetLaborPass' : 'gadgetMakroLinse';
              const descKey = id === 'labor-pass' ? 'gadgetLaborPassDesc' : 'gadgetMakroLinseDesc';

              return (
                <ShopRow
                  key={id}
                  icon={GADGET_ICON[id]}
                  name={t(titleKey)}
                  description={t(descKey)}
                  rightSlot={
                    owned ? (
                      <View style={styles.ownedPill}>
                        <Ionicons name="checkmark" size={13} color={colors.success} />
                        <Text style={styles.ownedText}>{t('owned')}</Text>
                      </View>
                    ) : lockedByLevel ? (
                      <Text style={styles.lockedMetaSmall}>
                        {t('lockedUntilLevel', { level: def.minLevel })}
                      </Text>
                    ) : (
                      <Button
                        title={t('buyForRp', { rp: def.priceRp })}
                        onPress={() => handleBuyGadget(id)}
                        variant="secondary"
                        size="sm"
                        disabled={lab.researchPoints < def.priceRp}
                      />
                    )
                  }
                />
              );
            })}
          </View>

          {/* ── 5. Community panel — copy only, no counters/buttons ── */}
          <View style={styles.communityTile}>
            <Ionicons name="people-outline" size={20} color={colors.textTertiary} />
            <View style={styles.communityBody}>
              <Text style={styles.communityTitle}>{t('communityTeaserTitle')}</Text>
              <Text style={styles.communityText}>{t('communityTeaserBody')}</Text>
            </View>
          </View>

          <View style={{ height: spacing.xxl }} />
        </Animated.View>
      </ScrollView>

      {/* ---- Lab-achievement unlock toast — non-blocking, stacked ---- */}
      {achievementToastVisible && pendingAchievementIds.length > 0 && (
        <AchievementToast
          ids={pendingAchievementIds}
          onDone={handleAchievementToastDone}
          onRowRevealed={handleAchievementRowRevealed}
        />
      )}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },

  /* ── Top bar ── */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    backgroundColor: colors.surfaceElevated,
  },

  /* ── Hero ── */
  hero: {
    alignItems: 'center',
    paddingHorizontal: gutter,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    ...typography.title2,
    color: colors.textPrimary,
  },
  heroStatLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  heroStatDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.separator,
    marginHorizontal: spacing.sm,
  },

  /* ── Weekly research focus ── */
  focusTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: gutter,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  focusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  focusBody: {
    flex: 1,
    gap: 2,
  },
  focusCategory: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  focusBonus: {
    ...typography.footnote,
    color: colors.textSecondary,
  },
  lockedTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    marginHorizontal: gutter,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  lockedBody: {
    flex: 1,
    gap: 2,
  },
  lockedTitle: {
    ...typography.callout,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  lockedDesc: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  lockedMeta: {
    ...typography.label,
    color: colors.textTertiary,
  },
  lockedMetaSmall: {
    ...typography.label,
    color: colors.textTertiary,
  },

  /* ── Sample bench ── */
  benchMeterText: {
    ...typography.caption,
    color: colors.textTertiary,
    ...{ fontVariant: ['tabular-nums'] as const },
  },
  benchEmpty: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: gutter,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  benchEmptyTitle: {
    ...typography.callout,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  benchEmptyBody: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  benchList: {
    paddingHorizontal: gutter,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    overflow: 'hidden',
  },
  samplePressed: {
    opacity: 0.8,
  },
  sampleThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sampleBody: {
    flex: 1,
    gap: 3,
  },
  sampleName: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  sampleScientific: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  sampleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  sampleObservations: {
    ...typography.label,
    color: colors.textTertiary,
    flexShrink: 1,
  },

  /* ── Shop ── */
  shopList: {
    paddingHorizontal: gutter,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  shopIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSubtle,
    flexShrink: 0,
  },
  shopBody: {
    flex: 1,
    gap: 2,
  },
  shopName: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  shopDesc: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  shopRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  ownedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.success}1A`,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  ownedText: {
    ...typography.label,
    color: colors.success,
  },

  /* ── Community teaser ── */
  communityTile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    marginHorizontal: gutter,
    padding: spacing.md,
  },
  communityBody: {
    flex: 1,
    gap: spacing.xs,
  },
  communityTitle: {
    ...typography.callout,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  communityText: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
});
