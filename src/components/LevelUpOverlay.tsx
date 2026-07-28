/**
 * LevelUpOverlay — full-screen takeover celebrating a level-up.
 *
 * Mounted by ResultScreen once the card reveal has settled, only when the
 * store reports a level was actually crossed by this catch
 * (`useLifeDexStore().consumeLevelUp()`). Purely a visual + haptic
 * celebration — LifeDex has no daily-cap/title system yet, so this NEVER
 * implies a concrete reward, just "you leveled up".
 *
 * Timeline:
 *   1. Scrim + content fade/scale in.
 *   2. The LevelRing fills from empty toward the player's real progress in
 *      the new level (LevelRing animates its own arc internally).
 *   3. Shortly after, an independent "overflow" shockwave ring expands
 *      outward and fades behind it, the big level number pops with a spring,
 *      and a success haptic fires — this reads as a celebration regardless
 *      of how full the real progress arc is.
 *   4. The motivational caption settles in below.
 *   5. Tapping anywhere, or a short auto-timeout, dismisses (fade/scale out).
 *
 * RN `Animated` + `useNativeDriver` only (no reanimated). Tokens only — no
 * raw hex.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LevelRing } from '@/components/LevelRing';
import { haptics } from '@/utils/haptics';
import { levelBounds, useLifeDexStore } from '@/store/useLifeDexStore';
import { colors, motion, radius, spacing, typography } from '@/theme/theme';
import { useT } from '@/i18n';

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    title: 'LEVEL UP',
    reached: 'Level {n} reached!',
    tapToContinue: 'Tap to continue',
  },
  de: {
    title: 'LEVEL-UP',
    reached: 'Level {n} erreicht!',
    tapToContinue: 'Zum Fortfahren tippen',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Timeline constants (ms)                                            */
/* ------------------------------------------------------------------ */

/** Beat after mount before the ring starts filling. */
const RING_FILL_DELAY = 150;
/** LevelRing's own internal arc-fill animation length (mirrors its source). */
const RING_FILL_DURATION = motion.duration.slow;
/** Small buffer after the fill lands before the overflow burst reads as "landed". */
const BURST_DELAY = 80;
/** Caption settles in just after the burst. */
const CAPTION_DELAY = 160;
/** Auto-dismiss once the moment has had time to land. */
const AUTO_DISMISS_MS = 3400;

const BURST_AT = RING_FILL_DELAY + RING_FILL_DURATION + BURST_DELAY;
const CAPTION_AT = BURST_AT + CAPTION_DELAY;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface LevelUpOverlayProps {
  /** The new level just reached. */
  level: number;
  /** Called once the takeover has fully faded out — the parent should unmount it. */
  onDismiss: () => void;
}

export function LevelUpOverlay({ level, onDismiss }: LevelUpOverlayProps): React.JSX.Element {
  const t = useT(C);
  const { profile } = useLifeDexStore();
  const bounds = levelBounds(profile.xp);

  const [ringTarget, setRingTarget] = useState(0);
  // Ref (not state) so the guard is always live even inside the stale closure
  // captured by the mount-effect's auto-dismiss timer below.
  const closingRef = useRef(false);

  const entrance = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const numberPop = useRef(new Animated.Value(1)).current;
  const captionAnim = useRef(new Animated.Value(0)).current;

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(entrance, {
      toValue: 0,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }, [entrance, onDismiss]);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.duration.base,
      easing: motion.easing.decel,
      useNativeDriver: true,
    }).start();

    const fillTimer = setTimeout(() => setRingTarget(bounds.progress), RING_FILL_DELAY);

    const burstTimer = setTimeout(() => {
      haptics.success();
      Animated.parallel([
        Animated.timing(burst, {
          toValue: 1,
          duration: 620,
          easing: motion.easing.decel,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(numberPop, {
            toValue: 1.22,
            duration: 160,
            easing: motion.easing.overshoot,
            useNativeDriver: true,
          }),
          Animated.timing(numberPop, {
            toValue: 1,
            duration: 220,
            easing: motion.easing.standard,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, BURST_AT);

    const captionTimer = setTimeout(() => {
      Animated.timing(captionAnim, {
        toValue: 1,
        duration: motion.duration.slow,
        easing: motion.easing.decel,
        useNativeDriver: true,
      }).start();
    }, CAPTION_AT);

    const dismissTimer = setTimeout(close, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(fillTimer);
      clearTimeout(burstTimer);
      clearTimeout(captionTimer);
      clearTimeout(dismissTimer);
    };
    // Mount-once timeline — intentionally excludes fast-changing deps (close,
    // bounds.progress) so it never re-schedules mid-animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] });
  const captionTranslate = captionAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const entranceScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        styles.root,
        { opacity: entrance, transform: [{ scale: entranceScale }] },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('tapToContinue')}
      />

      <View style={styles.content} pointerEvents="none">
        <View style={styles.ringWrap}>
          <Animated.View
            style={[
              styles.burstRing,
              { opacity: burstOpacity, transform: [{ scale: burstScale }] },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: numberPop }] }}>
            <LevelRing
              level={level}
              currentXp={Math.max(0, profile.xp - bounds.floor)}
              totalXp={Math.max(0, bounds.ceil - bounds.floor)}
              progress={ringTarget}
              size={220}
              strokeWidth={16}
            />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: captionAnim, transform: [{ translateY: captionTranslate }] }}>
          <View style={styles.titleRow}>
            <Ionicons name="trophy" size={18} color={colors.amber} />
            <Text style={styles.title}>{t('title')}</Text>
          </View>
          <Text style={styles.reached}>{t('reached', { n: level })}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  burstRing: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title2,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  reached: {
    ...typography.headline,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
