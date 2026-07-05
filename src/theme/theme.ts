/**
 * LifeDex visual theme v2 — "night-forest field guide".
 *
 * Dark-only by design (light mode deferred — this app's identity is a nocturnal
 * nature field guide). System font (SF Pro / Roboto) with an Apple-HIG weight +
 * tracking ramp. Every legacy token key is preserved as an alias so all screens
 * keep compiling while they migrate to the richer tokens.
 */
import { Easing } from 'react-native';
import type { Rarity } from '../domain/types';

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

export const colors = {
  // Canvas — deep forest-black, slightly green-shifted
  background: '#0A0E0C',
  surface: '#121815',
  surfaceElevated: '#1A211D',
  surfaceHigh: '#232C27',
  border: '#263029',
  borderStrong: '#33403A',
  separator: 'rgba(255,255,255,0.06)',
  overlay: 'rgba(5,9,7,0.72)',

  // Text hierarchy (4 levels)
  textPrimary: '#F4F7F5',
  textSecondary: '#A9B6AF',
  textTertiary: '#6C7972',
  textMuted: '#6C7972', // alias of tertiary (back-compat)
  textDisabled: '#48524C',

  // Brand accents
  accent: '#3ECFBD',
  accentPressed: '#2FAE9E',
  accentSubtle: 'rgba(62,207,189,0.14)',
  onAccent: '#06231E',
  teal: '#3ECFBD', // back-compat alias of accent
  moss: '#5C8A4E',
  amber: '#E8A33D',

  // Status
  success: '#43C97F',
  warning: '#E8A33D',
  danger: '#F26D5F',
  info: '#4C9EEB',
} as const;

/** Bottom-to-top scrim gradient stops for text over imagery. */
export const scrimGradient = ['rgba(10,14,12,0)', 'rgba(10,14,12,0.92)'] as const;

export const rarityColors: Record<Rarity, string> = {
  common: '#96A29C',
  uncommon: '#4AC585',
  rare: '#4D9BF5',
  epic: '#A66CFF',
  legendary: '#F5B841',
};

/** Soft tinted fills per rarity — use instead of ad-hoc `color + '22'`. */
export const rarityTints: Record<Rarity, string> = {
  common: 'rgba(150,162,156,0.12)',
  uncommon: 'rgba(74,197,133,0.14)',
  rare: 'rgba(77,155,245,0.14)',
  epic: 'rgba(166,108,255,0.16)',
  legendary: 'rgba(245,184,65,0.16)',
};

/* ------------------------------------------------------------------ */
/* Spacing / radius                                                    */
/* ------------------------------------------------------------------ */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/** Standard screen horizontal gutter. */
export const gutter = 20;

export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/* ------------------------------------------------------------------ */
/* Elevation (spread into styles: iOS shadow + Android elevation)      */
/* ------------------------------------------------------------------ */

export const elevation = {
  level1: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  level2: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 8 },
  level3: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.48, shadowRadius: 20, elevation: 14 },
} as const;

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

export const motion = {
  duration: { instant: 80, fast: 150, base: 250, slow: 400, reveal: 700 },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    decel: Easing.out(Easing.cubic),
    overshoot: Easing.out(Easing.back(1.4)),
  },
  spring: {
    press: { friction: 7, tension: 120 },
    gentle: { friction: 8, tension: 60 },
  },
} as const;

/* ------------------------------------------------------------------ */
/* Typography (system font, Apple ramp)                                */
/* ------------------------------------------------------------------ */

const tabularNums = { fontVariant: ['tabular-nums'] as const };

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: '800' as const, lineHeight: 41, letterSpacing: -0.4 },
  title1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34, letterSpacing: -0.35 },
  title2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.25 },
  headline: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22, letterSpacing: -0.1 },
  callout: { fontSize: 15, fontWeight: '500' as const, lineHeight: 20, letterSpacing: -0.1 },
  subheadline: { fontSize: 14, fontWeight: '500' as const, lineHeight: 19, letterSpacing: 0 },
  footnote: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 0 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16, letterSpacing: 0.1 },
  label: { fontSize: 11, fontWeight: '600' as const, lineHeight: 13, letterSpacing: 0.6 },

  // Back-compat aliases (kept until all screens migrate)
  display: { fontSize: 34, fontWeight: '800' as const, lineHeight: 41, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.25 },
  heading: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22, letterSpacing: -0.2 },
} as const;

/** Style helper for numeric displays (XP, ranks). */
export const numeric = tabularNums;

/* ------------------------------------------------------------------ */

export const theme = {
  colors,
  rarityColors,
  rarityTints,
  spacing,
  gutter,
  radius,
  elevation,
  motion,
  typography,
  scrimGradient,
} as const;

export type Theme = typeof theme;
