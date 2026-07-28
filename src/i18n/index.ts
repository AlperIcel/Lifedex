/**
 * Tiny, dependency-light i18n for LifeDex (English + German).
 *
 * Design goals:
 *  - CO-LOCATED strings: each screen ships its own `{ en, de }` catalog and calls
 *    `useT(catalog)`. There is NO central string file to edit, so screens can be
 *    translated independently without collisions.
 *  - Reactive: `setLang()` re-renders every subscribed component instantly.
 *  - Sensible default WITHOUT tracking: the initial language comes from the
 *    device locale (a German-language / DACH-region device → German, else
 *    English). We deliberately do NOT geolocate the user's IP — that would send
 *    their address to a third party, against the app's privacy stance. The user
 *    can always override in Settings; the choice is persisted.
 *
 * Shared enum labels (rarity, category, captive status) live in `useCommon()` so
 * they read identically everywhere.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { useEffect, useState } from 'react';

import type { CaptiveStatus, Category, Rarity } from '@/domain/types';

export type Lang = 'en' | 'de';
export const LANGS: readonly Lang[] = ['en', 'de'];
export const LANG_LABEL: Record<Lang, string> = { en: 'English', de: 'Deutsch' };

const STORAGE_KEY = 'lang:v1';
const DACH_REGIONS = new Set(['DE', 'AT', 'CH']);

/** Resolve the language from the device locale (no network, privacy-safe). */
function deviceDefault(): Lang {
  try {
    for (const l of Localization.getLocales()) {
      if (l.languageCode === 'de') return 'de';
      const region = l.regionCode;
      if (typeof region === 'string' && DACH_REGIONS.has(region)) return 'de';
    }
  } catch {
    // Localization unavailable — fall through to English.
  }
  return 'en';
}

let current: Lang = deviceDefault();
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getLang(): Lang {
  return current;
}

/** Set + persist the language and re-render subscribers. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  emit();
  void AsyncStorage.setItem(STORAGE_KEY, lang);
}

/**
 * Load the persisted choice (or lock in the device default) once at startup.
 * The first paint already uses the device default, so there is no flash.
 */
export async function hydrateLang(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'de') {
      if (stored !== current) {
        current = stored;
        emit();
      }
      return;
    }
  } catch {
    // fall through — keep the device default
  }
  void AsyncStorage.setItem(STORAGE_KEY, current);
}

/** Subscribe a component to the current language. */
export function useLang(): Lang {
  const [, force] = useState(0);
  useEffect(() => {
    const l = (): void => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return current;
}

type Catalog = Record<Lang, Record<string, string>>;

/**
 * Pure lookup + interpolation. Falls back to English, then to the key itself, so
 * a missing translation is never a crash. `vars` fill `{name}`-style placeholders.
 * Exported for unit testing; components use the `useT` hook.
 */
export function translate<C extends Catalog>(
  catalog: C,
  lang: Lang,
  key: keyof C['en'] & string,
  vars?: Record<string, string | number>,
): string {
  const table = catalog[lang] ?? catalog.en;
  const raw = table[key] ?? catalog.en[key] ?? key;
  if (vars === undefined) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * Bind a screen's local catalog to the current language. Returns a `t(key, vars?)`.
 */
export function useT<C extends Catalog>(
  catalog: C,
): (key: keyof C['en'] & string, vars?: Record<string, string | number>) => string {
  const lang = useLang();
  return (key, vars) => translate(catalog, lang, key, vars);
}

/* ------------------------------------------------------------------ */
/* Shared enum labels (used across many screens — keep them identical) */
/* ------------------------------------------------------------------ */

const RARITY: Record<Lang, Record<Rarity, string>> = {
  en: {
    common: 'Common',
    uncommon: 'Uncommon',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
  },
  de: {
    common: 'Gewöhnlich',
    uncommon: 'Ungewöhnlich',
    rare: 'Selten',
    epic: 'Episch',
    legendary: 'Legendär',
  },
};

const CATEGORY: Record<Lang, Record<Category, string>> = {
  en: { animal: 'Animal', plant: 'Plant', tree: 'Tree', mushroom: 'Mushroom', unknown: 'Unknown' },
  de: { animal: 'Tier', plant: 'Pflanze', tree: 'Baum', mushroom: 'Pilz', unknown: 'Unbekannt' },
};

const CAPTIVE: Record<Lang, Record<CaptiveStatus, string>> = {
  en: { wild: 'Wild', domestic: 'Domestic', zoo_captive: 'Zoo / Captive', unknown: 'Unknown' },
  de: { wild: 'Wild', domestic: 'Haustier', zoo_captive: 'Zoo / Gefangenschaft', unknown: 'Unbekannt' },
};

/** Current-language label helpers for the shared enums. */
export function useCommon(): {
  rarity: (r: Rarity) => string;
  category: (c: Category) => string;
  captive: (c: CaptiveStatus) => string;
} {
  const lang = useLang();
  return {
    rarity: (r) => RARITY[lang][r] ?? RARITY.en[r],
    category: (c) => CATEGORY[lang][c] ?? CATEGORY.en[c],
    captive: (c) => CAPTIVE[lang][c] ?? CAPTIVE.en[c],
  };
}
