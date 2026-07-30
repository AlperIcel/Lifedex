/**
 * taxonMedia — a RELIABLE reference photo (+ short summary) for a species, from
 * iNaturalist's public taxa API.
 *
 * Why this exists alongside lore.ts: lore.ts fetches from English Wikipedia by
 * exact title, which can miss (a redirect that doesn't resolve, no lead image,
 * a transient hiccup) — so some species showed no picture at all. iNaturalist,
 * by contrast, is a photo-first platform: `GET /v1/taxa?q=<name>` returns a
 * `default_photo` for essentially every species, plus a `wikipedia_summary`.
 * It's the SAME public, token-free API we already use for rarity
 * (inatObservations.ts), so it needs no key and no extra dependency.
 *
 * Used as the guaranteed image source for the Species-of-the-Day screen; the
 * richer multi-paragraph Wikipedia lore (lore.ts) is layered on top when it
 * resolves, with this summary as the text fallback.
 *
 * Best-effort + cached (memory + AsyncStorage, like lore.ts): resolves to null
 * offline / when nothing is found; a transient network error is NOT cached.
 *
 * Privacy: only the species name is ever sent — never user data, photos, or
 * location. iNat photos are CC-licensed, so `attribution` MUST be shown wherever
 * `imageUrl` is displayed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface TaxonMedia {
  /** Reference photo URL (iNaturalist default_photo, ~medium size). */
  imageUrl?: string;
  /** Required credit line for the photo (CC licence) — show it under the image. */
  attribution?: string;
  /** Short plain-text blurb (Wikipedia summary via iNat, HTML stripped). */
  summary?: string;
  /** Link to the Wikipedia article, when iNat has one. */
  url?: string;
  source: 'inaturalist';
}

const CACHE_PREFIX = 'taxonMedia:v1:';
const TAXA_API = 'https://api.inaturalist.org/v1/taxa';
const MISS = '__miss__';
const MAX_CHARS = 700;

const mem = new Map<string, TaxonMedia | null>();

function keyFor(scientificName: string | undefined, commonName: string): string {
  return (scientificName ?? commonName).trim().toLowerCase();
}

/** Strip HTML tags + decode the handful of entities iNat summaries contain. */
function stripHtml(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= MAX_CHARS) return text;
  const slice = text.slice(0, MAX_CHARS);
  const lastStop = slice.lastIndexOf('. ');
  return (lastStop > MAX_CHARS * 0.5 ? slice.slice(0, lastStop + 1) : slice.trimEnd()) + ' …';
}

/** Shape of the bits of the iNat taxa response we read. */
interface InatPhoto {
  medium_url?: string;
  attribution?: string;
}
interface InatTaxon {
  name?: string;
  default_photo?: InatPhoto | null;
  wikipedia_summary?: string | null;
  wikipedia_url?: string | null;
}

async function fetchOne(name: string): Promise<TaxonMedia | null> {
  const qs = new URLSearchParams({ q: name, per_page: '8', locale: 'en' });
  const resp = await fetch(`${TAXA_API}?${qs.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { results?: InatTaxon[] };
  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length === 0) return null;

  const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();
  const withPhoto = results.filter((r) => typeof r.default_photo?.medium_url === 'string');
  // Prefer an exact scientific-name match that has a photo; else the first with
  // a photo; else the first result at all (summary may still be present).
  const pick =
    withPhoto.find((r) => norm(r.name) === norm(name)) ?? withPhoto[0] ?? results[0];
  if (pick === undefined) return null;

  const photo = pick.default_photo ?? undefined;
  const summaryRaw = typeof pick.wikipedia_summary === 'string' ? pick.wikipedia_summary : '';
  const summary = summaryRaw.length > 0 ? stripHtml(summaryRaw) : undefined;
  const imageUrl = photo?.medium_url;

  // Nothing usable — treat as a miss so the caller can fall back.
  if (imageUrl === undefined && summary === undefined) return null;

  return {
    imageUrl,
    attribution: photo?.attribution,
    summary,
    url: typeof pick.wikipedia_url === 'string' ? pick.wikipedia_url : undefined,
    source: 'inaturalist',
  };
}

/**
 * Resolve a reference photo + blurb for a species. Tries the scientific name
 * first (most precise), then the common name. Caches every outcome (hit AND
 * miss) so it fetches at most once per species.
 */
export async function fetchTaxonMedia(
  scientificName: string | undefined,
  commonName: string,
): Promise<TaxonMedia | null> {
  const key = keyFor(scientificName, commonName);
  if (mem.has(key)) return mem.get(key) ?? null;

  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (cached !== null) {
      const parsed = cached === MISS ? null : (JSON.parse(cached) as TaxonMedia);
      mem.set(key, parsed);
      return parsed;
    }
  } catch {
    // cache read failed — fall through to network
  }

  let entry: TaxonMedia | null = null;
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

/** React hook: fetch taxon media for a species, with loading state. */
export function useTaxonMedia(
  scientificName: string | undefined,
  commonName: string,
): { media: TaxonMedia | null; loading: boolean } {
  const [media, setMedia] = useState<TaxonMedia | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMedia(null);
    void fetchTaxonMedia(scientificName, commonName).then((entry) => {
      if (active) {
        setMedia(entry);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [scientificName, commonName]);

  return { media, loading };
}
