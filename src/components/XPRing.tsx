/**
 * XPRing — circular SVG progress ring showing XP earned for a sighting,
 * with the numeric value centred inside.
 *
 * Uses react-native-svg (bundled with Expo) for the arc; falls back gracefully
 * if the package is unavailable (CI/test environments).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Rarity } from '@/domain/types';
import { rarityColors, colors, typography } from '@/theme/theme';

// react-native-svg is an Expo SDK dep — safe to require() so TS doesn't error
// in environments where the types aren't installed yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Svg: any, Circle: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rnsvg = require('react-native-svg');
  Svg = rnsvg.Svg;
  Circle = rnsvg.Circle;
} catch {
  Svg = null;
  Circle = null;
}

interface Props {
  xp: number;
  rarity: Rarity;
  /** Diameter of the ring in points. Defaults to 72. */
  size?: number;
  /** Fill fraction 0–1 for the arc. Defaults to 1 (full ring). */
  progress?: number;
}

export function XPRing({ xp, rarity, size = 72, progress = 1 }: Props): React.JSX.Element {
  const color = rarityColors[rarity];
  const strokeWidth = size < 56 ? 3 : 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const dashOffset = circumference * (1 - clampedProgress);
  const center = size / 2;

  const labelSize = size < 56 ? 11 : size < 80 ? 14 : 17;

  if (Svg && Circle) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Track */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={`${color}30`}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${center}, ${center}`}
          />
        </Svg>
        <Text style={[styles.xpLabel, { fontSize: labelSize, color }]}>
          {xp > 9999 ? `${Math.round(xp / 1000)}k` : String(xp)}
        </Text>
        <Text style={[styles.xpUnit, { fontSize: labelSize - 4, color: `${color}BB` }]}>XP</Text>
      </View>
    );
  }

  // Fallback: plain text badge when SVG unavailable.
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderColor: color, backgroundColor: `${color}22` },
      ]}
    >
      <Text style={[styles.xpLabel, { fontSize: labelSize, color }]}>
        {xp > 9999 ? `${Math.round(xp / 1000)}k` : String(xp)}
      </Text>
      <Text style={[styles.xpUnit, { fontSize: labelSize - 4, color: `${color}BB` }]}>XP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  xpLabel: {
    ...typography.heading,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
  xpUnit: {
    ...typography.label,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: -2,
    includeFontPadding: false,
  },
  fallback: {
    borderWidth: 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
