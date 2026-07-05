/**
 * FilterChipBar — a horizontally scrollable row of pill-shaped filter chips.
 *
 * Thin wrapper over the shared `Chip` primitive. Generic over the option value
 * type T so it can be used for both rarity and category filters (or anything
 * else). Caller provides label and color resolvers.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/theme';
import { Chip } from './Chip';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props<T extends string> {
  /** Short section label shown to the left (e.g. "Rarity"). */
  label: string;
  /** All available option values. */
  options: T[];
  /** Currently selected value. */
  selected: T;
  /** Called when the user taps a chip. */
  onSelect: (value: T) => void;
  /** Human-readable label for a chip value. */
  getLabel: (value: T) => string;
  /** Accent colour for the chip when selected; muted border when not. */
  getColor: (value: T) => string;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function FilterChipBar<T extends string>({
  label,
  options,
  selected,
  onSelect,
  getLabel,
  getColor,
}: Props<T>): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((value) => {
          const isSelected = value === selected;
          return (
            <Chip
              key={value}
              label={getLabel(value)}
              selected={isSelected}
              onPress={() => onSelect(value)}
              {...(isSelected ? { dotColor: getColor(value) } : {})}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginRight: spacing.sm,
    minWidth: 36,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    paddingRight: spacing.md,
  },
});
