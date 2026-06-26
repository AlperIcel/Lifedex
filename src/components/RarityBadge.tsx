/**
 * RarityBadge — compact pill displaying a rarity tier with its signature colour.
 * Used inside CardView and anywhere a rarity label is needed.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Rarity } from '@/domain/types';
import { rarityColors, spacing, radius, typography } from '@/theme/theme';

const LABELS: Record<Rarity, string> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

interface Props {
  rarity: Rarity;
  /** 'sm' renders a mini version for tight layouts. Defaults to 'md'. */
  size?: 'sm' | 'md';
}

export function RarityBadge({ rarity, size = 'md' }: Props): React.JSX.Element {
  const color = rarityColors[rarity];
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.pill,
        isSm ? styles.pillSm : styles.pillMd,
        { borderColor: color, backgroundColor: `${color}22` },
      ]}
    >
      <Text
        style={[
          styles.label,
          isSm ? styles.labelSm : styles.labelMd,
          { color },
        ]}
        numberOfLines={1}
      >
        {LABELS[rarity]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillMd: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs - 1,
  },
  pillSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
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
