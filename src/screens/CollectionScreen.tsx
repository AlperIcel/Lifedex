/**
 * CollectionScreen — the "Living-Dex": a per-category field-guide grid.
 *
 * Layout:
 *  - ScreenContainer large-title header ("Collection") + LVL accessory
 *  - Honest completion footnote ("X of Y species") over a thin 3px accent bar —
 *    counts only catalogued species, so it can never read past 100%
 *  - Two chip rows: rarity (with rarity-colour dots) and category (narrows
 *    the Dex to a single section)
 *  - One section per catalogue category (animal/plant/tree/mushroom, fixed
 *    order), each with a header ("<icon> <name>  12/29") followed by a
 *    2-column tile grid:
 *      - caught catalogue species render normally (art / name / rarity)
 *      - NOT-yet-caught catalogue species render as a dimmed SILHOUETTE
 *        (category icon outline, name hidden as "???", a subtle rarity-colour
 *        dot as a soft hint) — the "shape of the hole" that pulls players back
 *        out to fill it in (2026-07-29 audit/CEO note: "gotta catch 'em all")
 *      - species the player caught that AREN'T in the on-device catalogue
 *        ("bonus" finds — most real iNaturalist catches, since the catalogue
 *        is only ~47 species) still show up in their category, tagged
 *        "Bonus", but never count toward that category's completion — see
 *        `src/domain/dexGrouping.ts` for the full reasoning
 *  - A 5th "Unknown" section appears only if the recogniser itself couldn't
 *    categorise a catch; omitted entirely otherwise.
 *  - Tap a caught tile → CardDetail. Locked silhouettes are not tappable.
 *  - "Nothing here yet" empty state only when the active filters legitimately
 *    match zero entries (e.g. a category+rarity combo the catalogue doesn't
 *    have) — silhouettes themselves are NEVER hidden by filters, since hiding
 *    the gaps would defeat the point of this screen.
 *
 * Runs fully in mock mode — no API keys, no Supabase required.
 *
 * Data source: useLifeDexStore (owned cards) + src/domain/dexGrouping.ts
 * (pure) for the catalogue/silhouette structure, built from SPECIES_RULES.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Category, Rarity, Sighting } from '@/domain/types';
import { buildDex, DEX_CATEGORIES } from '@/domain/dexGrouping';
import type { DexEntry } from '@/domain/dexGrouping';
import {
  colors,
  gutter,
  motion,
  numeric,
  radius,
  rarityColors,
  scrimGradient,
  spacing,
  typography,
} from '@/theme/theme';
import type { RootStackParamList } from '@/navigation/types';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import type { CollectionCard } from '@/store/useLifeDexStore';
import { Chip, EmptyState, MockCardImage, RarityBadge, ScreenContainer } from '@/components';
import { haptics } from '@/utils/haptics';
import { useT, useCommon } from '@/i18n';

/* ------------------------------------------------------------------ */
/* Types & constants                                                    */
/* ------------------------------------------------------------------ */

type CollectionNav = NativeStackNavigationProp<RootStackParamList>;

type RarityFilter = Rarity | 'all';
type CategoryFilter = Category | 'all';

/** Pairs a CollectionCard with its resolved Sighting for rendering. */
interface CardRow {
  cardId: string;
  sighting: Sighting;
}

/** A flattened FlatList row: either a section header or a 1-2 tile grid row. */
type ListRow =
  | { type: 'header'; key: string; category: Category; caught: number; total: number; bonusCaught: number }
  | { type: 'tiles'; key: string; items: DexEntry[] };

const RARITY_FILTERS: RarityFilter[] = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
const CATEGORY_FILTERS: CategoryFilter[] = ['all', ...DEX_CATEGORIES];

/* ------------------------------------------------------------------ */
/* i18n catalog                                                        */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    title: 'Collection',
    completion: '{discovered} of {total} species',
    all: 'All',
    filterAnimals: 'Animals',
    filterPlants: 'Plants',
    filterTrees: 'Trees',
    filterFungi: 'Fungi',
    filterUnknown: 'Unknown',
    sectionCompletion: '{caught}/{total}',
    bonusSuffix: '+{count} bonus',
    bonusTag: 'Bonus',
    lockedHint: 'Undiscovered {category} · {rarity}',
    emptyFilteredTitle: 'Nothing here yet',
    emptyFilteredMessage: 'No cards match the current filters.',
    clearFilters: 'Clear filters',
  },
  de: {
    title: 'Sammlung',
    completion: '{discovered} von {total} Arten',
    all: 'Alle',
    filterAnimals: 'Tiere',
    filterPlants: 'Pflanzen',
    filterTrees: 'Bäume',
    filterFungi: 'Pilze',
    filterUnknown: 'Unbekannt',
    sectionCompletion: '{caught}/{total}',
    bonusSuffix: '+{count} Bonus',
    bonusTag: 'Bonus',
    lockedHint: 'Unentdeckt: {category} · {rarity}',
    emptyFilteredTitle: 'Noch nichts hier',
    emptyFilteredMessage: 'Keine Karten passen zu den aktuellen Filtern.',
    clearFilters: 'Filter zurücksetzen',
  },
} as const;

/** Bound-translator type, used by the module-level chip-label helper below. */
type TFunc = ReturnType<typeof useT<typeof C>>;

/**
 * Category filter-chip labels are their own plural set ("Animals", "Fungi", …),
 * distinct from the singular useCommon().category() labels used elsewhere
 * (e.g. the CardDetail stats row shows "Animal"). Reused below as the Dex
 * section-header title too, so chips and sections read identically. Rarity
 * chips reuse useCommon().rarity() directly since the wording is identical.
 */
function categoryChipLabel(t: TFunc, value: CategoryFilter): string {
  switch (value) {
    case 'all':
      return t('all');
    case 'animal':
      return t('filterAnimals');
    case 'plant':
      return t('filterPlants');
    case 'tree':
      return t('filterTrees');
    case 'mushroom':
      return t('filterFungi');
    case 'unknown':
      return t('filterUnknown');
  }
}

/** Category icon (Ionicons — no emoji in chrome), matching the app-wide convention. */
const CATEGORY_ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  animal: 'paw-outline',
  plant: 'flower-outline',
  tree: 'leaf-outline',
  mushroom: 'nutrition-outline',
  unknown: 'help-outline',
};

/** True when `entry`'s rarity (caught's actual rarity, or a locked slot's hint) matches `filter`. */
function matchesRarity(entry: DexEntry, filter: RarityFilter): boolean {
  if (filter === 'all') return true;
  const rarity = entry.kind === 'caught' ? entry.sighting.rarity : entry.baseRarity;
  return rarity === filter;
}

/** Grid gutter between tiles. */
const GRID_GAP = spacing.sm + 4;
/** Stagger config for the mount fade-in (first N FlatList rows only). */
const STAGGER_COUNT = 12;
const STAGGER_STEP_MS = 40;
/** theme.numeric's fontVariant is a readonly tuple; RN's TextStyle wants a mutable array. */
const tabularNums = { fontVariant: [...numeric.fontVariant] };

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export function CollectionScreen(): React.JSX.Element {
  const navigation = useNavigation<CollectionNav>();
  const store = useLifeDexStore();
  const t = useT(C);
  const common = useCommon();

  const collectionCards: CollectionCard[] = store.collectionCards;
  const level = store.profile.level;

  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  /**
   * Build CardRow pairs: resolve each CollectionCard to its Sighting.
   * Cards whose sighting is missing (should not happen with seeded data) are
   * silently dropped to avoid crashes. collectionCards is newest-first (see
   * useLifeDexStore), which buildDex relies on to keep the most recent catch
   * when a species was caught more than once.
   */
  const allRows = useMemo<CardRow[]>(() => {
    return collectionCards.reduce<CardRow[]>((acc, card) => {
      const sighting = store.getSightingById(card.sightingId);
      if (sighting !== undefined) {
        acc.push({ cardId: card.id, sighting });
      }
      return acc;
    }, []);
  }, [collectionCards, store]);

  /** The Living-Dex structure: catalogue sections with caught/locked/bonus entries. */
  const dex = useMemo(() => buildDex(allRows), [allRows]);

  /* Honest completion: catalogue-only, so it can never read past 100%. */
  const completion = dex.totalSpecies > 0 ? Math.min(1, dex.totalCaught / dex.totalSpecies) : 0;

  /**
   * Flatten dex.sections into FlatList rows: one header row per visible
   * section, followed by its entries chunked into 2-column tile rows. The
   * category filter narrows which sections appear; the rarity filter narrows
   * which ENTRIES appear within a section — but a section's header always
   * reports its true, unfiltered caught/total (the honest count), even if the
   * rarity filter hides every tile underneath it.
   */
  const listData = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];
    for (const sec of dex.sections) {
      if (categoryFilter !== 'all' && sec.category !== categoryFilter) continue;

      rows.push({
        type: 'header',
        key: `header:${sec.category}`,
        category: sec.category,
        caught: sec.caught,
        total: sec.total,
        bonusCaught: sec.bonusCaught,
      });

      const visible = sec.entries.filter((entry) => matchesRarity(entry, rarityFilter));
      for (let i = 0; i < visible.length; i += 2) {
        const pair = visible.slice(i, i + 2);
        rows.push({
          type: 'tiles',
          key: `tiles:${pair.map((e) => e.key).join('|')}`,
          items: pair,
        });
      }
    }
    return rows;
  }, [dex, categoryFilter, rarityFilter]);

  /** True as long as at least one section has a visible tile row under the active filters. */
  const hasVisibleTiles = useMemo(() => listData.some((row) => row.type === 'tiles'), [listData]);

  /* Navigate to CardDetail with the real CollectionCard id */
  const handleCardPress = useCallback(
    (cardId: string) => {
      haptics.press();
      navigation.navigate('CardDetail', { cardId });
    },
    [navigation],
  );

  const handleClearFilters = useCallback(() => {
    setRarityFilter('all');
    setCategoryFilter('all');
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: ListRow; index: number }) => {
      if (item.type === 'header') {
        return (
          <DexSectionHeader
            category={item.category}
            caught={item.caught}
            total={item.total}
            bonusCaught={item.bonusCaught}
          />
        );
      }
      return <TileRow items={item.items} index={index} onPressCard={handleCardPress} />;
    },
    [handleCardPress],
  );

  const keyExtractor = useCallback((item: ListRow) => item.key, []);

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <ScreenContainer
      title={t('title')}
      largeTitle
      padBottom={false}
      contentStyle={styles.content}
      rightAccessory={<Text style={styles.levelAccessory}>LVL {level}</Text>}
    >
      {/* ── Completion line + thin accent bar ── */}
      <View style={styles.completionBlock}>
        <Text style={styles.completionText}>
          {t('completion', { discovered: dex.totalCaught, total: dex.totalSpecies })}
        </Text>
        <View style={styles.completionTrack}>
          <View
            style={[styles.completionFill, { width: `${Math.round(completion * 100)}%` }]}
          />
        </View>
      </View>

      {/* ── Rarity chips (each shows its rarity-colour dot) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {RARITY_FILTERS.map((value) => (
          <Chip
            key={value}
            label={value === 'all' ? t('all') : common.rarity(value)}
            selected={value === rarityFilter}
            onPress={() => setRarityFilter(value)}
            {...(value !== 'all' ? { dotColor: rarityColors[value] } : {})}
          />
        ))}
      </ScrollView>

      {/* ── Category chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
      >
        {CATEGORY_FILTERS.map((value) => (
          <Chip
            key={value}
            label={categoryChipLabel(t, value)}
            selected={value === categoryFilter}
            onPress={() => setCategoryFilter(value)}
          />
        ))}
      </ScrollView>

      {/* ── Dex sections, or an honest "no matches" state for the active filters ── */}
      {hasVisibleTiles ? (
        <FlatList<ListRow>
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          windowSize={5}
        />
      ) : (
        <EmptyState
          icon="search-outline"
          title={t('emptyFilteredTitle')}
          message={t('emptyFilteredMessage')}
          actionTitle={t('clearFilters')}
          onAction={handleClearFilters}
        />
      )}
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Section header ("<icon> Animals   12/29  +3 bonus")                 */
/* ------------------------------------------------------------------ */

interface DexSectionHeaderProps {
  category: Category;
  caught: number;
  total: number;
  bonusCaught: number;
}

function DexSectionHeader({ category, caught, total, bonusCaught }: DexSectionHeaderProps): React.JSX.Element {
  const t = useT(C);
  const label = categoryChipLabel(t, category);
  // total === 0 is the bonus-only 'unknown' bucket — there's no catalogue
  // fraction to show, just the bonus count.
  const countText = total > 0 ? t('sectionCompletion', { caught, total }) : String(bonusCaught);
  const showBonusSuffix = total > 0 && bonusCaught > 0;

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <Ionicons name={CATEGORY_ICON[category]} size={18} color={colors.textSecondary} />
        <Text style={styles.sectionHeaderTitle} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.sectionHeaderRight}>
        <Text style={styles.sectionHeaderCount}>{countText}</Text>
        {showBonusSuffix ? (
          <Text style={styles.sectionHeaderBonus}>{t('bonusSuffix', { count: bonusCaught })}</Text>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Tile row (1-2 tiles) + individual tile, with mount stagger           */
/* ------------------------------------------------------------------ */

interface TileRowProps {
  items: DexEntry[];
  index: number;
  onPressCard: (cardId: string) => void;
}

function TileRow({ items, index, onPressCard }: TileRowProps): React.JSX.Element {
  return (
    <View style={styles.tileRow}>
      {items.map((entry) => (
        <GridTile key={entry.key} entry={entry} index={index} onPressCard={onPressCard} />
      ))}
    </View>
  );
}

interface GridTileProps {
  entry: DexEntry;
  index: number;
  onPressCard: (cardId: string) => void;
}

function GridTile({ entry, index, onPressCard }: GridTileProps): React.JSX.Element {
  const t = useT(C);
  const common = useCommon();
  /* Subtle staggered fade-in for the first rows only (native driver). */
  const opacity = useRef(new Animated.Value(index < STAGGER_COUNT ? 0 : 1)).current;

  useEffect(() => {
    if (index < STAGGER_COUNT) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.base,
        delay: index * STAGGER_STEP_MS,
        easing: motion.easing.decel,
        useNativeDriver: true,
      }).start();
    }
    // Mount-only animation; index is stable for a given key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entry.kind === 'locked') {
    return (
      <Animated.View style={[styles.tileWrapper, { opacity }]}>
        <View
          style={[styles.tile, styles.lockedTile]}
          accessible
          accessibilityLabel={t('lockedHint', {
            category: common.category(entry.category),
            rarity: common.rarity(entry.baseRarity),
          })}
        >
          <Ionicons
            name={CATEGORY_ICON[entry.category]}
            size={40}
            color={colors.textPrimary}
            style={styles.lockedIcon}
          />
          <Text style={styles.lockedName}>???</Text>
          <View
            style={[styles.lockedRarityDot, { backgroundColor: rarityColors[entry.baseRarity] }]}
          />
        </View>
      </Animated.View>
    );
  }

  const { sighting } = entry;
  const isHighTier = sighting.rarity === 'epic' || sighting.rarity === 'legendary';

  return (
    <Animated.View style={[styles.tileWrapper, { opacity }]}>
      <Pressable
        onPress={() => onPressCard(entry.cardId)}
        accessibilityRole="button"
        accessibilityLabel={`${sighting.commonName}, ${common.rarity(sighting.rarity)}`}
        style={({ pressed }) => [
          styles.tile,
          isHighTier && { borderWidth: 1, borderColor: rarityColors[sighting.rarity] },
          pressed && styles.tilePressed,
        ]}
      >
        <MockCardImage
          uri={sighting.publicImageUri}
          rarity={sighting.rarity}
          category={sighting.category}
          name={sighting.commonName}
        />
        {/* Bottom scrim keeps the overlay legible over any art. */}
        <LinearGradient
          colors={[...scrimGradient]}
          style={styles.tileScrim}
          pointerEvents="none"
        />
        <View style={styles.tileOverlay} pointerEvents="none">
          <RarityBadge rarity={sighting.rarity} size="sm" />
          <Text style={styles.tileName} numberOfLines={1}>
            {sighting.commonName}
          </Text>
        </View>
        {entry.isBonus ? (
          <View style={styles.bonusPill} pointerEvents="none">
            <Text style={styles.bonusPillText}>{t('bonusTag')}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  /* ScreenContainer content override: rows manage their own gutters. */
  content: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  levelAccessory: {
    ...typography.caption,
    color: colors.accent,
  },

  /* Completion */
  completionBlock: {
    paddingHorizontal: gutter,
    paddingBottom: spacing.sm,
  },
  completionText: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginBottom: spacing.xs + 2,
  },
  completionTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  completionFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },

  /* Filter chips */
  chipScroll: {
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    paddingHorizontal: gutter,
  },

  /* Section header */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    flexShrink: 1,
  },
  sectionHeaderTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs + 2,
  },
  sectionHeaderCount: {
    ...typography.subheadline,
    ...tabularNums,
    color: colors.textSecondary,
  },
  sectionHeaderBonus: {
    ...typography.caption,
    color: colors.accent,
  },

  /* Grid */
  grid: {
    paddingHorizontal: gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  tileRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  tileWrapper: {
    flex: 1,
    maxWidth: '50%',
  },
  tile: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tilePressed: {
    opacity: 0.85,
  },
  tileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  tileOverlay: {
    position: 'absolute',
    left: spacing.sm + 2,
    right: spacing.sm + 2,
    bottom: spacing.sm + 2,
    gap: spacing.xs,
  },
  tileName: {
    ...typography.subheadline,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  /* "Bonus" tag on an uncatalogued caught tile */
  bonusPill: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  bonusPillText: {
    ...typography.label,
    fontSize: 9,
    lineHeight: 11,
    color: colors.accent,
  },

  /* Locked silhouette placeholder */
  lockedTile: {
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  lockedIcon: {
    opacity: 0.28,
  },
  lockedName: {
    ...typography.caption,
    color: colors.textDisabled,
    letterSpacing: 2,
  },
  lockedRarityDot: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    opacity: 0.55,
  },
});
