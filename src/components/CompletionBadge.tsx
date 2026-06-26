/**
 * CompletionBadge — shows "X / N species discovered" with a mini progress bar.
 * Used at the top of CollectionScreen to give a Pokédex-style completion feel.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  discovered: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function CompletionBadge({ discovered, total }: Props): React.JSX.Element {
  const pct = useMemo(
    () => (total > 0 ? Math.min(1, discovered / total) : 0),
    [discovered, total],
  );
  const pctLabel = Math.round(pct * 100);

  return (
    <View style={styles.container}>
      <View style={styles.textRow}>
        <Text style={styles.fraction}>
          <Text style={styles.discovered}>{discovered}</Text>
          <Text style={styles.separator}> / </Text>
          <Text style={styles.total}>{total}</Text>
          <Text style={styles.label}> species discovered</Text>
        </Text>
        <Text style={styles.pct}>{pctLabel}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pctLabel}%` }]} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  textRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  fraction: {
    flexDirection: 'row',
  },
  discovered: {
    ...typography.heading,
    color: colors.teal,
    fontWeight: '800',
  },
  separator: {
    ...typography.caption,
    color: colors.textMuted,
  },
  total: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  pct: {
    ...typography.caption,
    color: colors.teal,
    fontWeight: '700',
  },
  track: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
  },
});
