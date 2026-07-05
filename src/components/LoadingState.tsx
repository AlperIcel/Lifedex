/**
 * LoadingState — centred spinner with an optional footnote label.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/theme';

interface Props {
  label?: string;
}

export function LoadingState({ label }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  label: {
    ...typography.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
