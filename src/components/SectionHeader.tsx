/**
 * SectionHeader — small uppercase section label with an optional right accessory.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, gutter, spacing, typography } from '@/theme/theme';

interface Props {
  title: string;
  /** Optional element rendered on the right (e.g. a "See all" link). */
  accessory?: React.ReactNode;
}

export function SectionHeader({ title, accessory }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.title} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  accessory: {
    marginLeft: spacing.sm,
  },
});
