/**
 * ScreenContainer — standard full-screen wrapper for LifeDex screens.
 *
 * Provides:
 *  - Safe-area insets via react-native-safe-area-context
 *  - Theme background colour
 *  - Optional ScrollView mode
 *  - Optional centred heading
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, gutter, spacing, typography } from '@/theme/theme';

interface Props {
  children: React.ReactNode;
  /** Optional screen title rendered at the top. */
  title?: string;
  /** When true, wraps children in a ScrollView. */
  scrollable?: boolean;
  /** Extra style applied to the inner content container. */
  contentStyle?: ViewStyle;
  /** Pad the bottom (useful above tab bars). Defaults to true. */
  padBottom?: boolean;
  /** Render the title as a large header row (typography.largeTitle). */
  largeTitle?: boolean;
  /** Optional element on the right of the large-title header row. */
  rightAccessory?: React.ReactNode;
}

export function ScreenContainer({
  children,
  title,
  scrollable = false,
  contentStyle,
  padBottom = true,
  largeTitle = false,
  rightAccessory,
}: Props): React.JSX.Element {
  const showLargeHeader = largeTitle && (title != null || rightAccessory != null);

  const inner = (
    <View style={[styles.content, padBottom && styles.contentPadBottom, contentStyle]}>
      {title && !largeTitle ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {showLargeHeader ? (
        <View style={styles.largeHeader}>
          <Text style={styles.largeTitle} numberOfLines={1}>
            {title}
          </Text>
          {rightAccessory ? <View style={styles.headerAccessory}>{rightAccessory}</View> : null}
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scrollable ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  contentPadBottom: {
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  largeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  largeTitle: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  headerAccessory: {
    marginLeft: spacing.sm,
  },
});
