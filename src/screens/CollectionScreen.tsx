/**
 * CollectionScreen — Apple-grade grid of collected cards.
 *
 * Layout:
 *  - ScreenContainer large-title header ("Collection") + LVL accessory
 *  - Completion footnote ("X of N species") over a thin 3px accent bar
 *  - Two chip rows: rarity (with rarity-colour dots) and category
 *  - 2-column grid of card tiles (MockCardImage art + scrim + name + rarity)
 *  - Undiscovered species render as locked placeholder tiles (capped)
 *  - Tap tile → CardDetail; empty states for "filtered empty" and "no cards"
 *
 * Runs fully in mock mode — no API keys, no Supabase required.
 *
 * Data source: useLifeDexStore (single source of truth). collectionCards link
 * back to their Sighting via sightingId; new captures appear automatically.
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
import {
  colors,
  gutter,
  motion,
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
import { TOTAL_SPECIES_COUNT } from '@/constants/species';

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

/** Grid item: an owned card tile or a locked "undiscovered" placeholder. */
type GridItem =
  | { kind: 'card'; cardId: string; sighting: Sighting }
  | { kind: 'locked'; id: string };

const RARITY_FILTERS: RarityFilter[] = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
const CATEGORY_FILTERS: CategoryFilter[] = ['all', 'animal', 'plant', 'tree', 'mushroom'];

const RARITY_LABELS: Record<RarityFilter, string> = {
  all: 'All',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  animal: 'Animals',
  plant: 'Plants',
  tree: 'Trees',
  mushroom: 'Fungi',
  unknown: 'Unknown',
};

/** Grid gutter between tiles. */
const GRID_GAP = spacing.sm + 4;
/** Cap locked placeholder tiles to roughly one screenful. */
const MAX_LOCKED_SLOTS = 8;
/** Stagger config for the mount fade-in. */
const STAGGER_COUNT = 12;
const STAGGER_STEP_MS = 40;

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export function CollectionScreen(): React.JSX.Element {
  const navigation = useNavigation<CollectionNav>();
  const store = useLifeDexStore();

  const collectionCards: CollectionCard[] = store.collectionCards;
  const level = store.profile.level;

  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const isFiltered = rarityFilter !== 'all' || categoryFilter !== 'all';

  /**
   * Build CardRow pairs: resolve each CollectionCard to its Sighting.
   * Cards whose sighting is missing (should not happen with seeded data) are
   * silently dropped to avoid crashes.
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

  /* Unique species owned (duplicates of a species count once). */
  const discoveredSpecies = useMemo(
    () => new Set(allRows.map((r) => r.sighting.commonName)).size,
    [allRows],
  );

  /* Apply rarity + category filters */
  const filtered = useMemo<CardRow[]>(() => {
    return allRows.filter(({ sighting }) => {
      const rarityMatch = rarityFilter === 'all' || sighting.rarity === rarityFilter;
      const categoryMatch = categoryFilter === 'all' || sighting.category === categoryFilter;
      return rarityMatch && categoryMatch;
    });
  }, [allRows, rarityFilter, categoryFilter]);

  /**
   * Grid data: owned tiles, then locked "undiscovered" placeholders. Locked
   * slots only appear in the unfiltered view when the known-species catalogue
   * (TOTAL_SPECIES_COUNT, mirrors seed.sql) exceeds what the player owns.
   */
  const gridData = useMemo<GridItem[]>(() => {
    const rows: GridItem[] = filtered.map((r) => ({
      kind: 'card',
      cardId: r.cardId,
      sighting: r.sighting,
    }));
    if (!isFiltered && rows.length > 0 && discoveredSpecies < TOTAL_SPECIES_COUNT) {
      const lockedCount = Math.min(TOTAL_SPECIES_COUNT - discoveredSpecies, MAX_LOCKED_SLOTS);
      for (let i = 0; i < lockedCount; i++) {
        rows.push({ kind: 'locked', id: `locked-${i}` });
      }
    }
    return rows;
  }, [filtered, isFiltered, discoveredSpecies]);

  const completion =
    TOTAL_SPECIES_COUNT > 0 ? Math.min(1, discoveredSpecies / TOTAL_SPECIES_COUNT) : 0;

  /* Navigate to CardDetail with the real CollectionCard id */
  const handleCardPress = useCallback(
    (cardId: string) => {
      haptics.press();
      navigation.navigate('CardDetail', { cardId });
    },
    [navigation],
  );

  const handleOpenCamera = useCallback(() => {
    navigation.navigate('Tabs', { screen: 'Capture' });
  }, [navigation]);

  const handleClearFilters = useCallback(() => {
    setRarityFilter('all');
    setCategoryFilter('all');
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: GridItem; index: number }) => (
      <GridTile item={item} index={index} onPressCard={handleCardPress} />
    ),
    [handleCardPress],
  );

  const keyExtractor = useCallback(
    (item: GridItem) => (item.kind === 'card' ? item.cardId : item.id),
    [],
  );

  /* Empty state: whole collection empty (real-mode fresh install) vs filters */
  const listEmpty =
    allRows.length === 0 ? (
      <EmptyState
        icon="leaf-outline"
        title="Your LifeDex is empty"
        message="Head outside and capture your first wild species to start the collection."
        actionTitle="Open camera"
        onAction={handleOpenCamera}
      />
    ) : (
      <EmptyState
        icon="search-outline"
        title="Nothing here yet"
        message="No cards match the current filters."
        actionTitle="Clear filters"
        onAction={handleClearFilters}
      />
    );

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <ScreenContainer
      title="Collection"
      largeTitle
      padBottom={false}
      contentStyle={styles.content}
      rightAccessory={<Text style={styles.levelAccessory}>LVL {level}</Text>}
    >
      {/* ── Completion line + thin accent bar ── */}
      <View style={styles.completionBlock}>
        <Text style={styles.completionText}>
          {discoveredSpecies} of {TOTAL_SPECIES_COUNT} species
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
            label={RARITY_LABELS[value]}
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
            label={CATEGORY_LABELS[value]}
            selected={value === categoryFilter}
            onPress={() => setCategoryFilter(value)}
          />
        ))}
      </ScrollView>

      {/* ── Card grid ── */}
      <FlatList<GridItem>
        data={gridData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={[styles.grid, gridData.length === 0 && styles.gridEmpty]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={listEmpty}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={5}
      />
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Grid tile (owned card or locked placeholder) with mount stagger      */
/* ------------------------------------------------------------------ */

interface GridTileProps {
  item: GridItem;
  index: number;
  onPressCard: (cardId: string) => void;
}

function GridTile({ item, index, onPressCard }: GridTileProps): React.JSX.Element {
  /* Subtle staggered fade-in for the first tiles only (native driver). */
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

  if (item.kind === 'locked') {
    return (
      <Animated.View style={[styles.tile, styles.lockedTile, { opacity }]}>
        <View style={styles.lockedIcon}>
          <Ionicons name="help-outline" size={36} color={colors.textPrimary} />
        </View>
      </Animated.View>
    );
  }

  const { sighting } = item;
  const isHighTier = sighting.rarity === 'epic' || sighting.rarity === 'legendary';

  return (
    <Animated.View style={[styles.tileWrapper, { opacity }]}>
      <Pressable
        onPress={() => onPressCard(item.cardId)}
        accessibilityRole="button"
        accessibilityLabel={`${sighting.commonName}, ${sighting.rarity}`}
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

  /* Grid */
  grid: {
    paddingHorizontal: gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  gridEmpty: {
    flexGrow: 1,
  },
  columnWrapper: {
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

  /* Locked placeholder */
  lockedTile: {
    maxWidth: '50%',
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedIcon: {
    opacity: 0.25,
  },
});
