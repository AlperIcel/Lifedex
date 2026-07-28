/**
 * Shared achievement TITLES + icons, keyed by the stable ids from
 * src/domain/achievements.ts. Mirrors the copy already shown in
 * src/screens/StatsScreen.tsx (ACHIEVEMENT_COPY_KEYS) so the unlock toast
 * (src/components/AchievementToast.tsx) reads the EXACT same title the player
 * already sees in the Stats/Achievements grid.
 *
 * Kept as its own small domain-adjacent module (rather than importing from
 * StatsScreen, which is a full screen component) so anything wanting just the
 * label/icon for an id — the toast today, possibly a notification or share
 * card later — doesn't have to pull in a screen. StatsScreen.tsx is left
 * untouched; this is a deliberate, reviewed duplication of its title strings,
 * not a refactor of it.
 *
 * Icons mirror the `build(...)` calls in computeAchievements() 1:1 — those are
 * fixed per id (not data-dependent), so duplicating the small id -> icon map
 * here avoids re-running computeAchievements() (which needs sightings/streak)
 * just to render a badge.
 */
import type { Ionicons } from '@expo/vector-icons';
import type { Lang } from '@/i18n';

/** English + German titles per achievement id — MUST match StatsScreen's C.en/C.de achXxxTitle strings. */
export const ACHIEVEMENT_TITLES: Record<string, Record<Lang, string>> = {
  'first-find': { en: 'First Discovery', de: 'Erste Entdeckung' },
  'finds-25': { en: '25 Finds', de: '25 Funde' },
  'species-10': { en: '10 Species', de: '10 Arten' },
  'species-25': { en: '25 Species', de: '25 Arten' },
  'species-50': { en: '50 Species', de: '50 Arten' },
  'all-categories': { en: 'All-Rounder', de: 'Allrounder' },
  'first-rare': { en: 'Rare Find', de: 'Seltener Fund' },
  'first-epic': { en: 'Epic Find', de: 'Epischer Fund' },
  'first-legendary': { en: 'Legendary Find', de: 'Legendärer Fund' },
  'streak-7': { en: '7-Day Streak', de: '7 Tage am Stück' },
  'today-3': { en: 'Good Day', de: 'Guter Tag' },
  'wild-explorer': { en: 'Wild Only', de: 'Nur Wildnis' },
};

/** Id -> icon, mirroring each `build(id, icon, ...)` call in computeAchievements(). */
export const ACHIEVEMENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'first-find': 'footsteps-outline',
  'finds-25': 'ribbon',
  'species-10': 'leaf-outline',
  'species-25': 'leaf',
  'species-50': 'planet-outline',
  'all-categories': 'grid',
  'first-rare': 'star-outline',
  'first-epic': 'star',
  'first-legendary': 'trophy',
  'streak-7': 'flame',
  'today-3': 'today-outline',
  'wild-explorer': 'paw-outline',
};

/** Title for achievement `id` in `lang`, falling back to English then the raw id. */
export function achievementTitle(id: string, lang: Lang): string {
  const entry = ACHIEVEMENT_TITLES[id];
  if (entry === undefined) return id;
  return entry[lang] ?? entry.en;
}

/** Icon for achievement `id`, falling back to a generic trophy glyph. */
export function achievementIcon(id: string): keyof typeof Ionicons.glyphMap {
  return ACHIEVEMENT_ICONS[id] ?? 'trophy';
}
