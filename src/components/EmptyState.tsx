/**
 * EmptyState — centred icon-in-circle + title + message, with an optional
 * secondary action button. Used for empty lists, no-permission states etc.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '@/theme/theme';
import { Button } from './Button';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  message,
  actionTitle,
  onAction,
}: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={48} color={colors.textTertiary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionTitle && onAction ? (
        <View style={styles.action}>
          <Button title={actionTitle} onPress={onAction} variant="secondary" size="md" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typography.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
  },
});
