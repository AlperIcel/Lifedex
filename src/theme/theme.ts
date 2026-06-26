/**
 * LifeDex visual theme — dark, immersive base with moss/teal/amber accents.
 * Rarity colors follow the standard collectible ladder.
 */
import type { Rarity } from '../domain/types';

export const colors = {
  background: '#0B0F0E',
  surface: '#141A18',
  surfaceElevated: '#1C2421',
  border: '#28332F',
  overlay: 'rgba(0,0,0,0.6)',

  textPrimary: '#F2F5F3',
  textSecondary: '#A9B5AF',
  textMuted: '#6B7872',

  moss: '#4F7942',
  teal: '#2DB1A3',
  amber: '#E8A33D',

  accent: '#2DB1A3',
  success: '#3FB97A',
  warning: '#E8A33D',
  danger: '#E5564B',
} as const;

export const rarityColors: Record<Rarity, string> = {
  common: '#9AA5A0',
  uncommon: '#3FB97A',
  rare: '#3D8BE8',
  epic: '#9B5DE5',
  legendary: '#E8A33D',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '800' as const, lineHeight: 40 },
  title: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  heading: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
} as const;

export const theme = {
  colors,
  rarityColors,
  spacing,
  radius,
  typography,
} as const;

export type Theme = typeof theme;
