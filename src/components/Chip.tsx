/**
 * Chip — pill-shaped selectable filter/tag chip.
 *
 * Selected: accentSubtle fill, accent text, strong border.
 * Unselected: elevated surface fill, secondary text.
 * Optional leading 6px colour dot (dotColor) or Ionicon.
 * Fires a guarded selection haptic on press.
 */
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '@/theme/theme';
import { haptics } from '@/utils/haptics';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading Ionicon (ignored when dotColor is set). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional leading 6px dot colour. Takes precedence over icon. */
  dotColor?: string;
}

export function Chip({ label, selected, onPress, icon, dotColor }: Props): React.JSX.Element {
  const handlePress = useCallback(() => {
    haptics.tap();
    onPress();
  }, [onPress]);

  const textColor = selected ? colors.accent : colors.textSecondary;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipUnselected,
        pressed && styles.chipPressed,
      ]}
    >
      {dotColor ? (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      ) : icon ? (
        <Ionicons name={icon} size={14} color={textColor} />
      ) : null}
      <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 2,
    gap: spacing.xs + 2,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.borderStrong,
  },
  chipUnselected: {
    backgroundColor: colors.surfaceElevated,
    borderColor: 'transparent',
  },
  chipPressed: {
    opacity: 0.75,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.callout,
  },
});
