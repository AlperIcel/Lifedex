/**
 * MockCardImage — renders a styled placeholder when the publicImageUri uses the
 * `mock-card://` scheme (dev/mock mode), or falls back to a real <Image> otherwise.
 *
 * The `mock-card://<category>/<slug>/<rarity>/<xp>` URI is produced by
 * MockCardGenProvider. We parse it to extract visual cues and draw a card-art
 * placeholder with emoji, gradient-like layering, and rarity colours.
 *
 * In production the real image URL (https://...) is passed and we render an Image.
 */
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { Category, Rarity } from '@/domain/types';
import { colors, rarityColors } from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  uri: string;
  rarity: Rarity;
  category: Category;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Emoji lookup                                                         */
/* ------------------------------------------------------------------ */

const CATEGORY_EMOJI: Record<Category, string> = {
  animal: '🦊',
  plant: '🌸',
  tree: '🌳',
  mushroom: '🍄',
  unknown: '🔮',
};

/** Second decorative emoji layered behind — varies by rarity. */
const RARITY_EMOJI: Record<Rarity, string> = {
  common: '✦',
  uncommon: '✦✦',
  rare: '✦✦✦',
  epic: '💠',
  legendary: '⭐',
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function MockCardImage({ uri, rarity, category, name }: Props): React.JSX.Element {
  const isMock = uri.startsWith('mock-card://');

  const rarityColor = useMemo(() => rarityColors[rarity] ?? colors.textMuted, [rarity]);

  if (!isMock) {
    return (
      <Image
        source={{ uri }}
        style={styles.realImage}
        resizeMode="cover"
        accessibilityLabel={`Card art for ${name}`}
      />
    );
  }

  /* ── Mock placeholder ── */
  const bigEmoji = CATEGORY_EMOJI[category] ?? '🔮';
  const rarityEmoji = RARITY_EMOJI[rarity] ?? '✦';

  return (
    <View style={styles.placeholder}>
      {/* Background gradient simulation via layered views */}
      <View style={[styles.bgLayer, { backgroundColor: rarityColor + '18' }]} />
      <View style={[styles.bgCircle, { backgroundColor: rarityColor + '22' }]} />

      {/* Rarity stars */}
      <Text style={[styles.rarityEmoji, { color: rarityColor + 'BB' }]}>
        {rarityEmoji}
      </Text>

      {/* Primary emoji */}
      <Text style={styles.mainEmoji}>{bigEmoji}</Text>

      {/* Species name, truncated */}
      <Text style={styles.placeholderName} numberOfLines={2}>
        {name}
      </Text>

      {/* Bottom shimmer line */}
      <View style={[styles.shimmerLine, { backgroundColor: rarityColor + '55' }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  realImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  bgLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgCircle: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    top: '20%',
    alignSelf: 'center',
  },
  rarityEmoji: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 11,
    letterSpacing: 2,
  },
  mainEmoji: {
    fontSize: 42,
    textAlign: 'center',
    marginBottom: 6,
  },
  placeholderName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 6,
    lineHeight: 13,
  },
  shimmerLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
  },
});
