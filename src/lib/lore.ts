/**
 * Species lore — a short, interesting blurb (origin, range, cool facts) for each
 * plant/animal, fetched on demand from Wikipedia's public REST summary API.
 *
 * Why Wikipedia: it scales to ANY species (no curated table to maintain), needs
 * NO API key, and returns a clean 1–3 sentence extract. Best-effort and cached:
 *   - Tries the scientific name first (most precise), then the common name.
 *   - Results (including "not found") are cached in AsyncStorage so we hit the
 *     network at most once per species, and never on a screen the user reopens.
 *   - On failure/offline it resolves to null; the UI falls back to the card's
 *     own generated description. Nothing here is required for the app to run.
 *
 * Privacy: only the species name is sent to Wikipedia — never user data, photos,
 * or location.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface LoreEntry {
  /** 1–3 sentence plain-text summary (the "interesting facts" blurb). */
  summary: string;
  /** Very short descriptor, e.g. "species of fern". */
  description?: string;
  /** Link to the full article. */
  url?: string;
  source: 'wikipedia';
}

const CACHE_PREFIX = 'lore:v1:';
const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/** Sentinel stored when Wikipedia has no usable article — avoids refetching. */
const MISS = '__miss__';

/** In-memory cache so re-opening a card in the same session is instant. */
const mem = new Map<string, LoreEntry | null>();

function keyFor(scientificName: string | undefined, commonName: string): string {
  return (scientificName ?? commonName).trim().toLowerCase();
}

/** Shape of the bits of the Wikipedia REST summary response we use. */
interface WikiSummary {
  type?: string;
  title?: string;
  extract?: string;
  description?: string;
  content_urls?: { desktop?: { page?: string } };
}

async function fetchOne(title: string): Promise<LoreEntry | null> {
  const url = `${WIKI_SUMMARY}${encodeURIComponent(title.trim().replace(/\s+/g, '_'))}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return null;
  const data = (await resp.json()) as WikiSummary;
  // Skip disambiguation / empty pages — they aren't real lore.
  if (data.type === 'disambiguation') return null;
  const summary = typeof data.extract === 'string' ? data.extract.trim() : '';
  if (summary.length === 0) return null;
  return {
    summary,
    description: typeof data.description === 'string' ? data.description : undefined,
    url: data.content_urls?.desktop?.page,
    source: 'wikipedia',
  };
}

/**
 * Resolve lore for a species. Returns null when nothing usable is found (offline,
 * or no article). Caches every outcome (hit AND miss) so it fetches at most once.
 */
export async function fetchLore(
  scientificName: string | undefined,
  commonName: string,
): Promise<LoreEntry | null> {
  const key = keyFor(scientificName, commonName);
  if (mem.has(key)) return mem.get(key) ?? null;

  // Persistent cache (survives restarts).
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (cached !== null) {
      const parsed = cached === MISS ? null : (JSON.parse(cached) as LoreEntry);
      mem.set(key, parsed);
      return parsed;
    }
  } catch {
    // cache read failed — fall through to network
  }

  let entry: LoreEntry | null = null;
  try {
    const candidates = [scientificName, commonName].filter(
      (c): c is string => typeof c === 'string' && c.trim().length > 0,
    );
    for (const c of candidates) {
      entry = await fetchOne(c);
      if (entry !== null) break;
    }
  } catch {
    // Network/offline — leave entry null. DON'T cache a transient network miss as
    // permanent; only cache a definitive "no article" result below.
    mem.set(key, null);
    return null;
  }

  mem.set(key, entry);
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, entry === null ? MISS : JSON.stringify(entry));
  } catch {
    // best-effort cache write
  }
  return entry;
}

/** React hook: fetch lore for a species, with loading state. */
export function useLore(
  scientificName: string | undefined,
  commonName: string,
): { lore: LoreEntry | null; loading: boolean } {
  const [lore, setLore] = useState<LoreEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLore(null);
    void fetchLore(scientificName, commonName).then((entry) => {
      if (active) {
        setLore(entry);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [scientificName, commonName]);

  return { lore, loading };
}
