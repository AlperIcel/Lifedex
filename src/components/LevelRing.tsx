/**
 * LevelRing — hero XP progress ring for the HomeScreen.
 *
 * Large ring showing level number + XP progress. Uses the same
 * react-native-svg dynamic import pattern as XPRing.tsx so it degrades
 * gracefully in test environments where SVG is unavailable.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@/theme/theme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Svg: any, Circle: any, Defs: any, LinearGradient: any, Stop: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rnsvg = require('react-native-svg');
  Svg = rnsvg.Svg;
  Circle = rnsvg.Circle;
  Defs = rnsvg.Defs;
  LinearGradient = rnsvg.LinearGradient;
  Stop = rnsvg.Stop;
} catch {
  Svg = null;
  Circle = null;
  Defs = null;
  LinearGradient = null;
  Stop = null;
}

interface LevelRingProps {
  /** Level integer displayed in the centre. */
  level: number;
  /** XP earned within the current level. */
  currentXp: number;
  /** Total XP needed to complete this level. */
  totalXp: number;
  /** Progress fraction 0..1. */
  progress: number;
  /** Outer diameter in logical pixels. Default 180. */
  size?: number;
  /** Stroke width in logical pixels. Default 14. */
  strokeWidth?: number;
}

export function LevelRing({
  level,
  currentXp,
  totalXp,
  progress,
  size = 180,
  strokeWidth = 14,
}: LevelRingProps): React.JSX.Element {
  const clamped = Math.min(1, Math.max(0, progress));
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamped);
  const cx = size / 2;

  if (Svg && Circle && Defs && LinearGradient && Stop) {
    return (
      <View style={[styles.wrapper, { width: size, height: size }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="xpGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={colors.teal} />
              <Stop offset="100%" stopColor={colors.moss} />
            </LinearGradient>
          </Defs>
          {/* Outer glow ring (decorative) */}
          <Circle
            cx={cx}
            cy={cx}
            r={r + strokeWidth * 0.6}
            stroke={`${colors.teal}18`}
            strokeWidth={strokeWidth * 0.4}
            fill="none"
          />
          {/* Track */}
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc */}
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke="url(#xpGrad)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            rotation="-90"
            origin={`${cx}, ${cx}`}
          />
        </Svg>

        {/* Centre content */}
        <View style={styles.centre}>
          <Text style={styles.levelLabel}>LEVEL</Text>
          <Text style={styles.levelNumber}>{level}</Text>
          <View style={styles.xpRow}>
            <Text style={styles.xpCurrent}>{currentXp}</Text>
            <Text style={styles.xpSep}> / </Text>
            <Text style={styles.xpTotal}>{totalXp}</Text>
          </View>
          <Text style={styles.xpUnit}>XP</Text>
        </View>
      </View>
    );
  }

  // Fallback for test / CI environments without SVG.
  return (
    <View
      style={[
        styles.wrapper,
        styles.fallback,
        { width: size, height: size, borderColor: colors.teal },
      ]}
    >
      <View style={styles.centre}>
        <Text style={styles.levelLabel}>LEVEL</Text>
        <Text style={styles.levelNumber}>{level}</Text>
        <Text style={styles.xpCurrent}>
          {currentXp}/{totalXp} XP
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  fallback: {
    borderWidth: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelLabel: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 3,
  },
  levelNumber: {
    fontSize: 52,
    fontWeight: '900' as const,
    color: colors.textPrimary,
    lineHeight: 56,
    letterSpacing: -1,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  xpCurrent: {
    ...typography.caption,
    color: colors.teal,
    fontWeight: '700' as const,
  },
  xpSep: {
    ...typography.caption,
    color: colors.textMuted,
  },
  xpTotal: {
    ...typography.caption,
    color: colors.textMuted,
  },
  xpUnit: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 2,
    marginTop: 1,
  },
});
