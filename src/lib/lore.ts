/**
 * Species lore — a rich, interesting blurb (origin, range, cool facts) plus a
 * reference photo for each plant/animal, from Wikipedia's public API.
 *
 * Why Wikipedia: it scales to ANY species (no curated table to maintain), needs
 * NO API key. We use the MediaWiki query API in a single call to get the FULL
 * lead section (several paragraphs — much richer than the short REST summary),
 * a short descriptor, and a thumbnail image. Best-effort and cached:
 *   - Tries the scientific name first (most precise), then the common name.
 *   - Redirects are followed (a scientific name resolves to the real article).
 *   - Results (including "not found") are cached in AsyncStorage so we hit the
 *     network at most once per species.
 *   - On failure/offline it resolves to null; the UI falls back to the card's
 *     own generated description. Nothing here is required for the app to run.
 *
 * Privacy: only the species name is sent to Wikipedia — never user data, photos,
 * or location.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface LoreEntry {
  /** Full lead section as plain text (multiple paragraphs, separated by \n\n). */
  summary: string;
  /** Very short descriptor, e.g. "species of fern". */
  description?: string;
  /** Reference photo of the species (Wikipedia lead image), if any. */
  imageUrl?: string;
  /** Link to the full article. */
  url?: string;
  source: 'wikipedia';
}

const CACHE_PREFIX = 'lore:v2:';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
/** Sentinel stored when Wikipedia has no usable article — avoids refetching. */
const MISS = '__miss__';
/** Cap very long articles so the card stays readable (kept at a sentence end). */
const MAX_CHARS = 1600;

/** In-memory cache so re-opening a card in the same session is instant. */
const mem = new Map<string, LoreEntry | null>();

function keyFor(scientificName: string | undefined, commonName: string): string {
  return (scientificName ?? commonName).trim().toLowerCase();
}

/** Trim to <= MAX_CHARS, cutting at the last sentence/paragraph boundary. */
function capText(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_CHARS) return t;
  const slice = t.slice(0, MAX_CHARS);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'));
  return (lastStop > MAX_CHARS * 0.5 ? slice.slice(0, lastStop + 1) : slice.trimEnd()) + ' …';
}

/** Shape of the bits of the MediaWiki query response we use. */
interface WikiPage {
  title?: string;
  missing?: string;
  extract?: string;
  description?: string;
  thumbnail?: { source?: string };
}
interface WikiResponse {
  query?: { pages?: Record<string, WikiPage> };
}

async function fetchOne(title: string): Promise<LoreEntry | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    titles: title.trim(),
    prop: 'extracts|pageimages|description',
    exintro: '1',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '640',
    origin: '*',
  });
  const resp = await fetch(`${WIKI_API}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as WikiResponse;
  const pages = data.query?.pages;
  if (pages === undefined) return null;
  const page = Object.values(pages)[0];
  if (page === undefined || page.missing !== undefined) return null;

  const extract = typeof page.extract === 'string' ? page.extract.trim() : '';
  if (extract.length === 0) return null;
  // A disambiguation page's extract typically says "may refer to" — skip it.
  if (/\bmay refer to\b/i.test(extract) && extract.length < 240) return null;

  const resolvedTitle = page.title ?? title;
  return {
    summary: capText(extract),
    description: typeof page.description === 'string' ? page.description : undefined,
    imageUrl: page.thumbnail?.source,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle.replace(/\s+/g, '_'))}`,
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
    // Network/offline — don't cache a transient miss as permanent.
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
