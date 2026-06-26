/**
 * CollectionCardThumbnail — single card tile in the collection grid.
 *
 * Visual:
 *  - Dark card surface with a coloured rarity border glow
 *  - Upper 2/3: card image area (renders mock-card:// placeholder)
 *  - Lower 1/3: name, rarity badge, XP chip
 *  - Press scale animation (Pressable)
 *
 * The publicImageUri uses the `mock-card://` scheme in dev mode. This component
 * detects that and renders a styled placeholder instead of an <Image>.
 */
import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Sighting } from '@/domain/types';
import { colors, radius, rarityColors, spacing, typography } from '@/theme/theme';
import { MockCardImage } from '@/components/MockCardImage';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  sighting: Sighting;
  onPress: (sighting: Sighting) => void;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const CATEGORY_ICONS: Record<string, string> = {
  animal: '🐾',
  plant: '🌿',
  tree: '🌲',
  mushroom: '🍄',
  unknown: '❓',
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function CollectionCardThumbnail({ sighting, onPress }: Props): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    onPress(sighting);
  }, [onPress, sighting]);

  const rarityColor = rarityColors[sighting.rarity] ?? colors.textMuted;
  const categoryIcon = CATEGORY_ICONS[sighting.category] ?? '❓';
  const rarityLabel = RARITY_LABELS[sighting.rarity] ?? sighting.rarity;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={`${sighting.commonName}, ${rarityLabel} card`}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.card,
          { borderColor: rarityColor, transform: [{ scale }] },
        ]}
      >
        {/* ── Glow overlay at top ── */}
        <View style={[styles.glowStrip, { backgroundColor: rarityColor + '33' }]} />

        {/* ── Card image area ── */}
        <View style={styles.imageArea}>
          <MockCardImage
            uri={sighting.publicImageUri}
            rarity={sighting.rarity}
            category={sighting.category}
            name={sighting.commonName}
          />
          {/* Category icon badge */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryIcon}>{categoryIcon}</Text>
          </View>
          {/* Sensitivity lock for hidden locations */}
          {sighting.publicLocation.hidden && (
            <View style={styles.hiddenBadge}>
              <Text style={styles.hiddenIcon}>🔒</Text>
            </View>
          )}
        </View>

        {/* ── Info area ── */}
        <View style={styles.infoArea}>
          <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="tail">
            {sighting.commonName}
          </Text>
          {sighting.scientificName != null && (
            <Text style={styles.scientificName} numberOfLines={1} ellipsizeMode="tail">
              {sighting.scientificName}
            </Text>
          )}

          {/* Bottom row: rarity pill + XP */}
          <View style={styles.bottomRow}>
            <View style={[styles.rarityPill, { backgroundColor: rarityColor + '22', borderColor: rarityColor }]}>
              <View style={[styles.rarityDot, { backgroundColor: rarityColor }]} />
              <Text style={[styles.rarityLabel, { color: rarityColor }]}>
                {rarityLabel}
              </Text>
            </View>
            <View style={styles.xpChip}>
              <Text style={styles.xpText}>+{sighting.xp}</Text>
              <Text style={styles.xpUnit}>XP</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const IMAGE_ASPECT = 1.1; // slightly taller than square for card feel

const styles = StyleSheet.create({
  card: {
    flex: 1,
    maxWidth: '49%', // two columns with a gap between
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  glowStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  imageArea: {
    aspectRatio: IMAGE_ASPECT,
    width: '100%',
    backgroundColor: colors.surface,
    position: 'relative',
  },
  categoryBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  categoryIcon: {
    fontSize: 14,
  },
  hiddenBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  hiddenIcon: {
    fontSize: 12,
  },
  infoArea: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  scientificName: {
    ...typography.label,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  rarityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    gap: 4,
  },
  rarityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rarityLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  xpChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  xpText: {
    ...typography.label,
    color: colors.amber,
    fontWeight: '700',
  },
  xpUnit: {
    fontSize: 9,
    color: colors.amber,
    fontWeight: '600',
  },
});
