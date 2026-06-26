/**
 * CollectionScreen — grid of all collected cards with filter chips and completion %.
 *
 * Layout:
 *  - Fixed header: title + XP progress bar
 *  - Horizontal filter chips: ALL | Rarity | Category
 *  - Completion badge (X / N species discovered)
 *  - 2-column FlatList of CollectionCardThumbnail tiles
 *  - Tapping a card navigates to CardDetail
 *
 * Runs fully in mock mode — no API keys, no Supabase required.
 *
 * Data source: useLifeDexStore (single source of truth). collectionCards are
 * read via listCollection(); each card links back to its Sighting via sightingId.
 * New captures added via sightingPipeline appear here automatically because the
 * pipeline writes to lifeDexStore.addSighting before navigating away.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Category, Rarity, Sighting } from '@/domain/types';
import { colors, rarityColors, radius, spacing, typography } from '@/theme/theme';
import type { RootStackParamList } from '@/navigation/types';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import type { CollectionCard } from '@/store/useLifeDexStore';
import { CollectionCardThumbnail } from '@/components/CollectionCardThumbnail';
import { FilterChipBar } from '@/components/FilterChipBar';
import { CompletionBadge } from '@/components/CompletionBadge';
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

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export function CollectionScreen(): React.JSX.Element {
  const navigation = useNavigation<CollectionNav>();
  const store = useLifeDexStore();

  // Read collection cards and linked sightings from the single source of truth.
  const collectionCards: CollectionCard[] = store.collectionCards;
  const { profile } = store;
  const totalXp = profile.xp;
  const level = profile.level;

  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

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

  /* Apply rarity + category filters */
  const filtered = useMemo<CardRow[]>(() => {
    return allRows.filter(({ sighting }) => {
      const rarityMatch = rarityFilter === 'all' || sighting.rarity === rarityFilter;
      const categoryMatch = categoryFilter === 'all' || sighting.category === categoryFilter;
      return rarityMatch && categoryMatch;
    });
  }, [allRows, rarityFilter, categoryFilter]);

  /* XP progress within current level (every 500 XP = 1 level) */
  const XP_PER_LEVEL = 500;
  const xpIntoLevel = totalXp % XP_PER_LEVEL;
  const xpProgress = xpIntoLevel / XP_PER_LEVEL;

  /* Navigate to CardDetail with the real CollectionCard id */
  const handleCardPress = useCallback(
    (cardId: string) => {
      navigation.navigate('CardDetail', { cardId });
    },
    [navigation],
  );

  /* Render each grid tile */
  const renderItem = useCallback(
    ({ item }: { item: CardRow }) => (
      <CollectionCardThumbnail
        sighting={item.sighting}
        onPress={() => handleCardPress(item.cardId)}
      />
    ),
    [handleCardPress],
  );

  const keyExtractor = useCallback((item: CardRow) => item.cardId, []);

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Collection</Text>
        <View style={styles.levelRow}>
          <Text style={styles.levelLabel}>LVL {level}</Text>
          <Text style={styles.xpLabel}>{totalXp.toLocaleString()} XP</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(xpProgress * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.xpSublabel}>
          {xpIntoLevel} / {XP_PER_LEVEL} XP to next level
        </Text>
      </View>

      {/* ── Completion badge ── */}
      <CompletionBadge discovered={collectionCards.length} total={TOTAL_SPECIES_COUNT} />

      {/* ── Rarity filter chips ── */}
      <FilterChipBar<RarityFilter>
        label="Rarity"
        options={RARITY_FILTERS}
        selected={rarityFilter}
        onSelect={setRarityFilter}
        getLabel={(v) => RARITY_LABELS[v] ?? v}
        getColor={(v) => (v === 'all' ? colors.accent : (rarityColors[v as Rarity] ?? colors.textMuted))}
      />

      {/* ── Category filter chips ── */}
      <FilterChipBar<CategoryFilter>
        label="Type"
        options={CATEGORY_FILTERS}
        selected={categoryFilter}
        onSelect={setCategoryFilter}
        getLabel={(v) => CATEGORY_LABELS[v] ?? v}
        getColor={() => colors.moss}
      />

      {/* ── Results count ── */}
      <View style={styles.resultsRow}>
        <Text style={styles.resultsText}>
          {filtered.length} card{filtered.length !== 1 ? 's' : ''}
          {rarityFilter !== 'all' || categoryFilter !== 'all' ? ' (filtered)' : ''}
        </Text>
      </View>

      {/* ── Card grid ── */}
      <FlatList<CardRow>
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState />}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={5}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */

function EmptyState(): React.JSX.Element {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🌿</Text>
      <Text style={styles.emptyTitle}>No cards yet</Text>
      <Text style={styles.emptyBody}>
        Go outside and photograph something wild!
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const STATUSBAR_HEIGHT =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 44;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Header */
  header: {
    paddingTop: STATUSBAR_HEIGHT + spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  levelLabel: {
    ...typography.heading,
    color: colors.accent,
  },
  xpLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  xpSublabel: {
    ...typography.label,
    color: colors.textMuted,
  },

  /* Results row */
  resultsRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  resultsText: {
    ...typography.label,
    color: colors.textMuted,
  },

  /* Grid */
  grid: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },

  /* Empty state */
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
