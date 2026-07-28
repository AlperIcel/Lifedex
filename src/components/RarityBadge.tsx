/**
 * RarityBadge — compact pill displaying a rarity tier with its signature colour.
 * Soft rarity-tint fill + 6px leading dot; epic/legendary get a 1px colour border.
 * Used inside CardView and anywhere a rarity label is needed.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Rarity } from '@/domain/types';
import { rarityColors, rarityTints, spacing, radius, typography } from '@/theme/theme';
import { useCommon } from '@/i18n';

interface Props {
  rarity: Rarity;
  /** 'sm' renders a mini version for tight layouts. Defaults to 'md'. */
  size?: 'sm' | 'md';
}

export function RarityBadge({ rarity, size = 'md' }: Props): React.JSX.Element {
  const common = useCommon();
  const color = rarityColors[rarity];
  const isSm = size === 'sm';
  const bordered = rarity === 'epic' || rarity === 'legendary';

  return (
    <View
      style={[
        styles.pill,
        isSm ? styles.pillSm : styles.pillMd,
        { backgroundColor: rarityTints[rarity] },
        bordered && { borderWidth: 1, borderColor: color },
      ]}
    >
      <View style={[styles.dot, isSm && styles.dotSm, { backgroundColor: color }]} />
      <Text
        style={[
          styles.label,
          isSm ? styles.labelSm : styles.labelMd,
          { color },
        ]}
        numberOfLines={1}
      >
        {common.rarity(rarity).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillMd: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs - 1,
    gap: spacing.xs + 1,
  },
  pillSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSm: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  label: {
    ...typography.label,
    letterSpacing: 1.2,
  },
  labelMd: {
    fontSize: typography.label.fontSize,
  },
  labelSm: {
    fontSize: 10,
    lineHeight: 14,
  },
});
