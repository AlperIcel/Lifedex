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
import { colors, spacing, typography } from '@/theme/theme';

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
}

export function ScreenContainer({
  children,
  title,
  scrollable = false,
  contentStyle,
  padBottom = true,
}: Props): React.JSX.Element {
  const inner = (
    <View style={[styles.content, padBottom && styles.contentPadBottom, contentStyle]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
});
