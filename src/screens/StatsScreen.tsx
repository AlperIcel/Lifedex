/**
 * StatsScreen — local "Stats & Achievements" hub. Replaces the Leaderboard tab
 * for v1 (see STATUS.md "Release plan": v1 ships single-player only). Everything
 * here is derived from the LOCAL store + local streak meta — no network, no
 * other players, nothing simulated.
 *
 * Sections:
 *  1. Profile hero — username + LevelRing + XP-to-next-level caption
 *  2. Overview tiles — total species / total finds / today / day streak
 *  3. Breakdown by category (useCommon().category) and rarity (rarityColors)
 *  4. Achievements grid — locked (dimmed + "current/target") vs unlocked
 *     (coloured icon + checkmark). Titles/descriptions are looked up locally by
 *     the stable `id` computeAchievements() returns; the domain layer stays
 *     string-free (src/domain/achievements.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer, SectionHeader, LevelRing } from '@/components';
import type { Achievement } from '@/domain/achievements';
import { computeAchievements } from '@/domain/achievements';
import { computeStats } from '@/domain/stats';
import type { Category, Rarity } from '@/domain/types';
import { useCommon, useT } from '@/i18n';
import { loadStreakMeta } from '@/store/persistence';
import { useLabStore } from '@/store/lab';
import {
  levelBounds,
  selectTodayCount,
  useLifeDexStore,
} from '@/store/useLifeDexStore';
import {
  colors,
  elevation,
  gutter,
  radius,
  rarityColors,
  spacing,
  typography,
} from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* i18n                                                                 */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    title: 'Stats',
    toNextCaption: '{toNext} XP to level {level}',
    overviewSpecies: 'Species',
    overviewFinds: 'Total finds',
    overviewToday: 'Today',
    overviewStreak: 'Day streak',
    sectionByCategory: 'By category',
    sectionByRarity: 'By rarity',
    sectionAchievements: 'Achievements',
    achievementCount: '{unlocked}/{total}',
    progressFormat: '{current}/{target}',
    unlockedLabel: 'Unlocked',

    achFirstFindTitle: 'First Discovery',
    achFirstFindDesc: 'Log your first sighting.',
    achFinds25Title: '25 Finds',
    achFinds25Desc: 'Log 25 sightings in total.',
    achSpecies10Title: '10 Species',
    achSpecies10Desc: 'Discover 10 unique species.',
    achSpecies25Title: '25 Species',
    achSpecies25Desc: 'Discover 25 unique species.',
    achSpecies50Title: '50 Species',
    achSpecies50Desc: 'Discover 50 unique species.',
    achAllCategoriesTitle: 'All-Rounder',
    achAllCategoriesDesc: 'Find an animal, a plant, a tree, and a mushroom.',
    achFirstRareTitle: 'Rare Find',
    achFirstRareDesc: 'Catch a rare species or better.',
    achFirstEpicTitle: 'Epic Find',
    achFirstEpicDesc: 'Catch an epic species or better.',
    achFirstLegendaryTitle: 'Legendary Find',
    achFirstLegendaryDesc: 'Catch a legendary species.',
    achStreak7Title: '7-Day Streak',
    achStreak7Desc: 'Reach a 7-day capture streak.',
    achToday3Title: 'Good Day',
    achToday3Desc: 'Log 3 sightings today.',
    achWildExplorerTitle: 'Wild Only',
    achWildExplorerDesc: 'Log 10 wild (non-captive) sightings.',
    achFirstSampleTitle: 'First Sample',
    achFirstSampleDesc: 'File your first sample on the Solo Lab bench.',
    achFieldResearcherTitle: 'Field Researcher',
    achFieldResearcherDesc: 'File 5 samples on the Solo Lab bench.',
    achLabPatronTitle: 'Lab Patron',
    achLabPatronDesc: 'File 15 samples on the Solo Lab bench.',
  },
  de: {
    title: 'Statistiken',
    toNextCaption: '{toNext} XP bis Level {level}',
    overviewSpecies: 'Arten',
    overviewFinds: 'Funde gesamt',
    overviewToday: 'Heute',
    overviewStreak: 'Tage-Serie',
    sectionByCategory: 'Nach Kategorie',
    sectionByRarity: 'Nach Seltenheit',
    sectionAchievements: 'Erfolge',
    achievementCount: '{unlocked}/{total}',
    progressFormat: '{current}/{target}',
    unlockedLabel: 'Freigeschaltet',

    achFirstFindTitle: 'Erste Entdeckung',
    achFirstFindDesc: 'Erfasse deine erste Sichtung.',
    achFinds25Title: '25 Funde',
    achFinds25Desc: 'Erfasse 25 Sichtungen insgesamt.',
    achSpecies10Title: '10 Arten',
    achSpecies10Desc: 'Entdecke 10 einzigartige Arten.',
    achSpecies25Title: '25 Arten',
    achSpecies25Desc: 'Entdecke 25 einzigartige Arten.',
    achSpecies50Title: '50 Arten',
    achSpecies50Desc: 'Entdecke 50 einzigartige Arten.',
    achAllCategoriesTitle: 'Allrounder',
    achAllCategoriesDesc: 'Finde ein Tier, eine Pflanze, einen Baum und einen Pilz.',
    achFirstRareTitle: 'Seltener Fund',
    achFirstRareDesc: 'Fang eine seltene Art oder besser.',
    achFirstEpicTitle: 'Epischer Fund',
    achFirstEpicDesc: 'Fang eine epische Art oder besser.',
    achFirstLegendaryTitle: 'Legendärer Fund',
    achFirstLegendaryDesc: 'Fang eine legendäre Art.',
    achStreak7Title: '7 Tage am Stück',
    achStreak7Desc: 'Erreiche eine 7-Tage-Serie.',
    achToday3Title: 'Guter Tag',
    achToday3Desc: 'Erfasse heute 3 Sichtungen.',
    achWildExplorerTitle: 'Nur Wildnis',
    achWildExplorerDesc: 'Erfasse 10 wilde (nicht domestizierte) Sichtungen.',
    achFirstSampleTitle: 'Erste Probe',
    achFirstSampleDesc: 'Reiche deine erste Probe auf der Forschungsbank ein.',
    achFieldResearcherTitle: 'Feldforscher',
    achFieldResearcherDesc: 'Reiche 5 Proben auf der Forschungsbank ein.',
    achLabPatronTitle: 'Labor-Förderer',
    achLabPatronDesc: 'Reiche 15 Proben auf der Forschungsbank ein.',
  },
} as const;

type TFunc = ReturnType<typeof useT<typeof C>>;

/** Maps each stable achievement id (src/domain/achievements.ts) to its i18n keys. */
const ACHIEVEMENT_COPY_KEYS: Record<
  string,
  { titleKey: keyof typeof C.en; descKey: keyof typeof C.en }
> = {
  'first-find': { titleKey: 'achFirstFindTitle', descKey: 'achFirstFindDesc' },
  'finds-25': { titleKey: 'achFinds25Title', descKey: 'achFinds25Desc' },
  'species-10': { titleKey: 'achSpecies10Title', descKey: 'achSpecies10Desc' },
  'species-25': { titleKey: 'achSpecies25Title', descKey: 'achSpecies25Desc' },
  'species-50': { titleKey: 'achSpecies50Title', descKey: 'achSpecies50Desc' },
  'all-categories': { titleKey: 'achAllCategoriesTitle', descKey: 'achAllCategoriesDesc' },
  'first-rare': { titleKey: 'achFirstRareTitle', descKey: 'achFirstRareDesc' },
  'first-epic': { titleKey: 'achFirstEpicTitle', descKey: 'achFirstEpicDesc' },
  'first-legendary': { titleKey: 'achFirstLegendaryTitle', descKey: 'achFirstLegendaryDesc' },
  'streak-7': { titleKey: 'achStreak7Title', descKey: 'achStreak7Desc' },
  'today-3': { titleKey: 'achToday3Title', descKey: 'achToday3Desc' },
  'wild-explorer': { titleKey: 'achWildExplorerTitle', descKey: 'achWildExplorerDesc' },
  'first-sample': { titleKey: 'achFirstSampleTitle', descKey: 'achFirstSampleDesc' },
  'field-researcher': { titleKey: 'achFieldResearcherTitle', descKey: 'achFieldResearcherDesc' },
  'lab-patron': { titleKey: 'achLabPatronTitle', descKey: 'achLabPatronDesc' },
};

function achievementCopy(t: TFunc, id: string): { title: string; description: string } {
  const keys = ACHIEVEMENT_COPY_KEYS[id];
  if (keys === undefined) return { title: id, description: '' };
  return { title: t(keys.titleKey), description: t(keys.descKey) };
}

/* ------------------------------------------------------------------ */
/* Category icons (Ionicons — no emoji in chrome)                      */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  animal: 'paw-outline',
  plant: 'flower-outline',
  tree: 'leaf-outline',
  mushroom: 'nutrition-outline',
  unknown: 'help-outline',
};

const CATEGORY_ORDER: readonly Category[] = ['animal', 'plant', 'tree', 'mushroom'];
const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Bar width % for a locked achievement's progress fill (small visible sliver when >0). */
function progressPct(current: number, target: number): number {
  if (target <= 0 || current <= 0) return 0;
  return Math.max(6, Math.min(100, (current / target) * 100));
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

interface OverviewTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  accent?: string;
}

function OverviewTile({ icon, value, label, accent }: OverviewTileProps): React.JSX.Element {
  const color = accent ?? colors.accent;
  return (
    <View style={styles.overviewTile}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.overviewValue}>{value}</Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </View>
  );
}

interface BreakdownRowProps {
  label: string;
  count: number;
  total: number;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

function BreakdownRow({ label, count, total, color, icon }: BreakdownRowProps): React.JSX.Element {
  const widthPct = count > 0 && total > 0 ? Math.max((count / total) * 100, 4) : 0;
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownHeaderRow}>
        <View style={styles.breakdownLeading}>
          {icon ? (
            <Ionicons name={icon} size={16} color={color} />
          ) : (
            <View style={[styles.breakdownDot, { backgroundColor: color }]} />
          )}
          <Text style={styles.breakdownLabel}>{label}</Text>
        </View>
        <Text style={styles.breakdownCount}>{count}</Text>
      </View>
      <View style={styles.breakdownTrack}>
        <View style={[styles.breakdownFill, { width: `${widthPct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function AchievementTile({ achievement }: { achievement: Achievement }): React.JSX.Element {
  const t = useT(C);
  const { unlocked, progress, icon } = achievement;
  const copy = achievementCopy(t, achievement.id);
  const statusLabel = unlocked
    ? t('unlockedLabel')
    : t('progressFormat', { current: progress.current, target: progress.target });

  return (
    <View
      style={[styles.achTile, unlocked ? styles.achTileUnlocked : styles.achTileLocked]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${copy.title}. ${copy.description} ${statusLabel}`}
    >
      <View style={styles.achIconRow}>
        <View style={[styles.achIconWrap, unlocked && styles.achIconWrapUnlocked]}>
          <Ionicons name={icon} size={22} color={unlocked ? colors.accent : colors.textDisabled} />
        </View>
        {unlocked ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
      </View>

      <Text style={[styles.achTitle, !unlocked && styles.achTitleLocked]} numberOfLines={1}>
        {copy.title}
      </Text>
      <Text style={styles.achDescription} numberOfLines={2}>
        {copy.description}
      </Text>

      {unlocked ? (
        <Text style={styles.achUnlockedText}>{statusLabel}</Text>
      ) : (
        <View style={styles.achProgressRow}>
          <View style={styles.achProgressTrack}>
            <View
              style={[
                styles.achProgressFill,
                { width: `${progressPct(progress.current, progress.target)}%` },
              ]}
            />
          </View>
          <Text style={styles.achProgressText}>
            {t('progressFormat', { current: progress.current, target: progress.target })}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export function StatsScreen(): React.JSX.Element {
  const t = useT(C);
  const common = useCommon();
  const state = useLifeDexStore();
  const { profile, sightings } = state;

  // Streak lives in AsyncStorage (src/store/persistence.ts), not the in-memory
  // store — load it once on mount. Best-effort; starts at 0 until it resolves.
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadStreakMeta().then((meta) => {
      if (!cancelled) setStreak(meta.streak);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Solo Lab filed-sample count — drives the three lab achievements below
  // (first-sample / field-researcher / lab-patron); everything else here is
  // unaffected by it.
  const lab = useLabStore();

  const lb = useMemo(() => levelBounds(profile.xp), [profile.xp]);
  const stats = useMemo(() => computeStats(sightings), [sightings]);
  const achievements = useMemo(
    () => computeAchievements(sightings, streak, lab.samples.length),
    [sightings, streak, lab.samples.length],
  );
  const todayCount = useMemo(() => selectTodayCount(state), [state]);
  const unlockedCount = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);

  const categoryRows = useMemo(() => {
    const rows: { category: Category; count: number }[] = CATEGORY_ORDER.map((category) => ({
      category,
      count: stats.byCategory[category],
    }));
    if (stats.byCategory.unknown > 0) {
      rows.push({ category: 'unknown', count: stats.byCategory.unknown });
    }
    return rows;
  }, [stats]);

  return (
    <ScreenContainer
      title={t('title')}
      largeTitle
      scrollable
      padBottom
      rightAccessory={<Text style={styles.levelAccessory}>{`LVL ${profile.level}`}</Text>}
    >
      {/* ── Profile hero: username + level ring ─────────────── */}
      <View style={styles.hero}>
        <Text style={styles.username} numberOfLines={1}>
          {profile.username}
        </Text>
        <LevelRing
          level={lb.level}
          currentXp={profile.xp - lb.floor}
          totalXp={lb.ceil - lb.floor}
          progress={lb.progress}
          size={140}
          strokeWidth={12}
        />
        <Text style={styles.toNextCaption}>
          {t('toNextCaption', { toNext: lb.toNext.toLocaleString(), level: lb.level + 1 })}
        </Text>
      </View>

      {/* ── Overview tiles ───────────────────────────────────── */}
      <View style={styles.overviewGrid}>
        <OverviewTile icon="leaf-outline" value={String(stats.totalSpecies)} label={t('overviewSpecies')} />
        <OverviewTile icon="albums-outline" value={String(stats.totalFinds)} label={t('overviewFinds')} />
        <OverviewTile icon="today-outline" value={String(todayCount)} label={t('overviewToday')} />
        <OverviewTile
          icon="flame"
          value={String(streak)}
          label={t('overviewStreak')}
          accent={streak > 0 ? colors.amber : undefined}
        />
      </View>

      {/* ── By category ──────────────────────────────────────── */}
      <SectionHeader title={t('sectionByCategory')} />
      <View style={styles.breakdownList}>
        {categoryRows.map(({ category, count }) => (
          <BreakdownRow
            key={category}
            icon={CATEGORY_ICON[category]}
            label={common.category(category)}
            count={count}
            total={stats.totalFinds}
            color={colors.accent}
          />
        ))}
      </View>

      {/* ── By rarity ────────────────────────────────────────── */}
      <SectionHeader title={t('sectionByRarity')} />
      <View style={styles.breakdownList}>
        {RARITY_ORDER.map((rarity) => (
          <BreakdownRow
            key={rarity}
            label={common.rarity(rarity)}
            count={stats.byRarity[rarity]}
            total={stats.totalFinds}
            color={rarityColors[rarity]}
          />
        ))}
      </View>

      {/* ── Achievements ─────────────────────────────────────── */}
      <SectionHeader
        title={t('sectionAchievements')}
        accessory={
          <Text style={styles.achievementCount}>
            {t('achievementCount', { unlocked: unlockedCount, total: achievements.length })}
          </Text>
        }
      />
      <View style={styles.achievementGrid}>
        {achievements.map((a) => (
          <AchievementTile key={a.id} achievement={a} />
        ))}
      </View>

      <View style={styles.bottomPad} />
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  levelAccessory: {
    ...typography.caption,
    color: colors.accent,
  },

  /* Hero */
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...elevation.level1,
  },
  username: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  toNextCaption: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },

  /* Overview grid (2x2) */
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  overviewTile: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  overviewValue: {
    ...typography.title2,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.textPrimary,
  },
  overviewLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },

  /* Breakdown rows (category / rarity) */
  breakdownList: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm + 4,
  },
  breakdownRow: {
    gap: spacing.xs,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    flexShrink: 1,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  breakdownCount: {
    ...typography.callout,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.textPrimary,
    fontWeight: '700' as const,
  },
  breakdownTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: radius.pill,
  },

  /* Achievements */
  achievementCount: {
    ...typography.label,
    color: colors.textTertiary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 4,
    paddingBottom: spacing.sm,
  },
  achTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
  },
  achTileLocked: {
    backgroundColor: colors.surfaceElevated,
    borderColor: 'transparent',
  },
  achTileUnlocked: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  achIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  achIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  achIconWrapUnlocked: {
    backgroundColor: colors.background,
  },
  achTitle: {
    ...typography.subheadline,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  achTitleLocked: {
    color: colors.textSecondary,
  },
  achDescription: {
    ...typography.footnote,
    color: colors.textTertiary,
    minHeight: 32,
  },
  achUnlockedText: {
    ...typography.label,
    color: colors.success,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  achProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  achProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  achProgressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
  },
  achProgressText: {
    ...typography.label,
    ...{ fontVariant: ['tabular-nums'] as const },
    color: colors.textTertiary,
  },

  bottomPad: {
    height: spacing.xl,
  },
});
