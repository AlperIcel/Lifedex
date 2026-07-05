/**
 * Button — the standard LifeDex action button.
 *
 * Variants:
 *  - primary:     accent background, onAccent text (main CTA)
 *  - secondary:   elevated surface + strong border
 *  - ghost:       transparent, accent text
 *  - destructive: danger tint background, danger text
 *
 * Press feedback: spring scale to 0.97 (native driver) + guarded light haptic.
 */
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, elevation, motion, radius, spacing, typography } from '@/theme/theme';
import { haptics } from '@/utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface Props {
  title: string;
  onPress: () => void;
  variant: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading Ionicon. */
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  /** Swap the label for a spinner while keeping the button width. */
  loading?: boolean;
  /** Fire haptics.press() on press. Defaults to true. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

const MIN_HEIGHT: Record<ButtonSize, number> = { lg: 52, md: 44, sm: 36 };
const ICON_SIZE: Record<ButtonSize, number> = { lg: 20, md: 18, sm: 16 };

/** Soft danger tint derived from the danger token (no dangerSubtle token yet). */
const DANGER_TINT = `${colors.danger}22`;

export function Button({
  title,
  onPress,
  variant,
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  haptic = true,
  style,
  fullWidth = false,
}: Props): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  const blocked = disabled || loading;

  const springTo = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        friction: motion.spring.press.friction,
        tension: motion.spring.press.tension,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const handlePressIn = useCallback(() => springTo(0.97), [springTo]);
  const handlePressOut = useCallback(() => springTo(1), [springTo]);

  const handlePress = useCallback(() => {
    if (blocked) return;
    if (haptic) haptics.press();
    onPress();
  }, [blocked, haptic, onPress]);

  const textColor =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'ghost'
        ? colors.accent
        : variant === 'destructive'
          ? colors.danger
          : colors.textPrimary;

  const spinnerColor = variant === 'primary' ? colors.onAccent : colors.accent;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={blocked ? undefined : handlePressIn}
      onPressOut={blocked ? undefined : handlePressOut}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: loading }}
      style={fullWidth ? styles.fullWidth : styles.selfStart}
    >
      <Animated.View
        style={[
          styles.base,
          variantStyles[variant],
          { minHeight: MIN_HEIGHT[size], transform: [{ scale }] },
          disabled && styles.disabled,
          fullWidth && styles.fullWidth,
          style,
        ]}
      >
        {/* Label row — kept mounted (transparent) while loading to preserve width. */}
        <View style={[styles.labelRow, loading && styles.hidden]}>
          {icon ? (
            <Ionicons
              name={icon}
              size={ICON_SIZE[size]}
              color={textColor}
              style={styles.icon}
            />
          ) : null}
          <Text style={[styles.label, sizeText[size], { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {loading ? (
          <View style={styles.spinnerOverlay} testID="button-loading">
            <ActivityIndicator size="small" color={spinnerColor} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    opacity: 0,
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.sm - 2,
  },
  label: {
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.accent,
    ...elevation.level1,
  },
  secondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  destructive: {
    backgroundColor: DANGER_TINT,
  },
};

const sizeText = StyleSheet.create({
  lg: { ...typography.headline },
  md: { ...typography.callout, fontWeight: '600' as const },
  sm: { ...typography.subheadline, fontWeight: '600' as const },
});
