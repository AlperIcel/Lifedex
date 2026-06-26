/**
 * FilterChipBar — a horizontally scrollable row of pill-shaped filter chips.
 *
 * Generic over the option value type T so it can be used for both rarity and
 * category filters (or anything else). Caller provides label and color resolvers.
 */
import React, { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/theme';

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
  const renderChip = useCallback(
    (value: T) => {
      const isSelected = value === selected;
      const color = getColor(value);
      const chipLabel = getLabel(value);

      return (
        <Pressable
          key={value}
          onPress={() => onSelect(value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${label} filter: ${chipLabel}`}
          style={({ pressed }) => [
            styles.chip,
            isSelected
              ? { backgroundColor: color + '28', borderColor: color }
              : { backgroundColor: 'transparent', borderColor: colors.border },
            pressed && styles.chipPressed,
          ]}
        >
          {isSelected && <View style={[styles.activeDot, { backgroundColor: color }]} />}
          <Text
            style={[
              styles.chipLabel,
              isSelected ? { color } : { color: colors.textMuted },
            ]}
          >
            {chipLabel}
          </Text>
        </Pressable>
      );
    },
    [selected, getColor, getLabel, label, onSelect],
  );

  return (
    <View style={styles.row}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {options.map(renderChip)}
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
    color: colors.textMuted,
    marginRight: spacing.sm,
    minWidth: 36,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs - 2,
    gap: 5,
  },
  chipPressed: {
    opacity: 0.75,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipLabel: {
    ...typography.label,
    fontWeight: '600',
  },
});
