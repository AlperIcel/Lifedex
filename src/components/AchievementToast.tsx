/**
 * AchievementToast — compact, stacked toast celebrating newly-unlocked
 * achievements (src/domain/achievements.ts).
 *
 * Shown by ResultScreen after the card reveal (and any level-up takeover) has
 * settled, from `lifeDexStore.consumeAchievements()`'s returned ids. Purely
 * presentational: given the ids already unlocked this capture, it looks up
 * title + icon (src/domain/achievementLabels.ts, mirrors StatsScreen's
 * achievement copy) and renders one row per id, stacked vertically. Rows
 * enter with a short stagger and the whole stack auto-dismisses after a few
 * seconds.
 *
 * Deliberately NON-blocking (`pointerEvents="none"`, no scrim, no full-screen
 * takeover) so it never competes with or gates anything else on screen —
 * unlike LevelUpOverlay, this is a side celebration, not the main event.
 *
 * No sound/haptics here, mirroring how FlipCard calls back to ResultScreen's
 * `handleFlipComplete` for its feedback rather than firing it internally:
 * `onRowRevealed` fires the instant each row starts its entrance animation so
 * the CALLER can fire a haptic + sound beat in sync, once per unlock.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { achievementIcon, achievementTitle } from '@/domain/achievementLabels';
import { useLang, useT } from '@/i18n';
import { colors, elevation, motion, radius, spacing, typography } from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

const C = {
  en: { unlocked: 'Achievement unlocked: {title}' },
  de: { unlocked: 'Achievement freigeschaltet: {title}' },
} as const;

/* ------------------------------------------------------------------ */
/* Timeline constants (ms)                                            */
/* ------------------------------------------------------------------ */

/** How long the whole stack stays up before auto-dismissing. */
const AUTO_DISMISS_MS = 3200;
/** Stagger between each row's entrance. */
const ROW_STAGGER_MS = 130;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface AchievementToastProps {
  /** Newly-unlocked achievement ids, in unlock order (from consumeAchievements()). */
  ids: string[];
  /** Called once the stack has fully faded out — the parent should unmount it. */
  onDone: () => void;
  /** Fires the instant the i-th row (0-based) starts entering — hook a haptic/sound beat here. */
  onRowRevealed?: (id: string, index: number) => void;
}

export function AchievementToast({
  ids,
  onDone,
  onRowRevealed,
}: AchievementToastProps): React.JSX.Element | null {
  const t = useT(C);
  const lang = useLang();
  const stackAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (ids.length === 0) return;

    Animated.timing(stackAnim, {
      toValue: 1,
      duration: motion.duration.slow,
      easing: motion.easing.decel,
      useNativeDriver: true,
    }).start();

    const dismissTimer = setTimeout(() => {
      if (closingRef.current) return;
      closingRef.current = true;
      Animated.timing(stackAnim, {
        toValue: 0,
        duration: motion.duration.base,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone();
      });
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(dismissTimer);
    // Mount-once entrance/auto-dismiss timeline for this fixed `ids` batch —
    // intentionally excludes onDone/stackAnim (stable refs) from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.length]);

  if (ids.length === 0) return null;

  const translateY = stackAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity: stackAnim, transform: [{ translateY }] }]}
    >
      {ids.map((id, i) => (
        <ToastRow
          key={`${id}-${i}`}
          index={i}
          label={t('unlocked', { title: achievementTitle(id, lang) })}
          icon={achievementIcon(id)}
          onRevealed={onRowRevealed !== undefined ? () => onRowRevealed(id, i) : undefined}
        />
      ))}
    </Animated.View>
  );
}

function ToastRow({
  index,
  label,
  icon,
  onRevealed,
}: {
  index: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onRevealed?: () => void;
}): React.JSX.Element {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      onRevealed?.();
      Animated.timing(enter, {
        toValue: 1,
        duration: motion.duration.slow,
        easing: motion.easing.overshoot,
        useNativeDriver: true,
      }).start();
    }, index * ROW_STAGGER_MS);
    return () => clearTimeout(timer);
    // Mount-once per row — index/onRevealed are fixed for this row's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <Animated.View style={[styles.row, { opacity: enter, transform: [{ scale }] }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
    zIndex: 90,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...elevation.level2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSubtle,
  },
  label: {
    ...typography.subheadline,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
});
