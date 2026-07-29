/**
 * Tests for the taxon lookup + cache (src/lib/inatObservations.ts).
 *
 * `fetch` is mocked — NO network happens. These cover the things that matter
 * about this module:
 *   1. Privacy: the request carries a taxon id and nothing else.
 *   2. Best-effort: every failure mode resolves to `{}` instead of throwing,
 *      so a lookup can never block or fail a catch.
 *   3. Caching: one request per species, misses cached, transport failures NOT
 *      cached, entries expire.
 *   4. Family extraction: the `rank: 'family'` ancestor becomes `.family`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __clearObservationsMemCache,
  fetchTaxonInfo,
} from '@/lib/inatObservations';

const TAXON = 12_345;
const URL = `https://api.inaturalist.org/v1/taxa/${TAXON}`;

type FetchMock = jest.Mock;
const fetchMock = (): FetchMock => globalThis.fetch as unknown as FetchMock;

interface Ancestor {
  name?: unknown;
  rank?: unknown;
}

function okWith(
  count: unknown,
  ancestors?: Ancestor[],
): { ok: true; status: number; json: () => Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [{ observations_count: count, ancestors }] }),
  };
}

/** A realistic ancestor chain for an oak (Quercus robur, family Fagaceae). */
const OAK_ANCESTORS: Ancestor[] = [
  { name: 'Plantae', rank: 'kingdom' },
  { name: 'Tracheophyta', rank: 'phylum' },
  { name: 'Magnoliopsida', rank: 'class' },
  { name: 'Fagales', rank: 'order' },
  { name: 'Fagaceae', rank: 'family' },
  { name: 'Quercus', rank: 'genus' },
];

beforeEach(async () => {
  __clearObservationsMemCache();
  await AsyncStorage.clear();
  (globalThis as { fetch?: unknown }).fetch = jest.fn();
});

/* ------------------------------------------------------------------ */
/* Happy path                                                          */
/* ------------------------------------------------------------------ */

describe('fetchTaxonInfo — happy path', () => {
  it('returns the global observation count', async () => {
    fetchMock().mockResolvedValue(okWith(42_000));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({ observationsCount: 42_000 });
  });

  it('floors a fractional count so it satisfies the integer schema', async () => {
    fetchMock().mockResolvedValue(okWith(1234.7));
    const info = await fetchTaxonInfo(TAXON);
    expect(info.observationsCount).toBe(1234);
  });

  it('returns the family from the ancestor chain alongside the count', async () => {
    fetchMock().mockResolvedValue(okWith(155_000, OAK_ANCESTORS));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({
      observationsCount: 155_000,
      family: 'Fagaceae',
    });
  });

  it('trims a family name', async () => {
    fetchMock().mockResolvedValue(okWith(1_000, [{ name: '  Fagaceae  ', rank: 'family' }]));
    const info = await fetchTaxonInfo(TAXON);
    expect(info.family).toBe('Fagaceae');
  });

  it('omits family when the ancestor chain has none', async () => {
    fetchMock().mockResolvedValue(okWith(1_000, [{ name: 'Animalia', rank: 'kingdom' }]));
    const info = await fetchTaxonInfo(TAXON);
    expect(info.family).toBeUndefined();
  });

  it('omits family when ancestors is missing entirely', async () => {
    fetchMock().mockResolvedValue(okWith(1_000));
    const info = await fetchTaxonInfo(TAXON);
    expect(info.family).toBeUndefined();
  });

  it('omits family when ancestors is malformed', async () => {
    fetchMock().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ observations_count: 1_000, ancestors: 'nope' }] }),
    });
    const info = await fetchTaxonInfo(TAXON);
    expect(info.family).toBeUndefined();
    expect(info.observationsCount).toBe(1_000);
  });
});

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

describe('fetchTaxonInfo — privacy', () => {
  it('sends ONLY the taxon id: no body, no coordinates, no auth', async () => {
    fetchMock().mockResolvedValue(okWith(1_000, OAK_ANCESTORS));
    await fetchTaxonInfo(TAXON);

    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(url).not.toMatch(/lat|lng|file:|user/i);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|bearer/i);
  });
});

/* ------------------------------------------------------------------ */
/* Best-effort: nothing here ever throws                               */
/* ------------------------------------------------------------------ */

describe('fetchTaxonInfo — best effort', () => {
  it('resolves {} when the network is down (never throws)', async () => {
    fetchMock().mockRejectedValue(new Error('offline'));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});
  });

  it('resolves {} on an HTTP error', async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});
  });

  it('resolves {} on a malformed body', async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});
  });

  it('omits the count when iNat reports a nonsense count, but keeps the family', async () => {
    fetchMock().mockResolvedValue(okWith(-5, OAK_ANCESTORS));
    const info = await fetchTaxonInfo(TAXON);
    expect(info.observationsCount).toBeUndefined();
    expect(info.family).toBe('Fagaceae');
  });

  it('rejects an invalid taxon id without touching the network', async () => {
    await expect(fetchTaxonInfo(0)).resolves.toEqual({});
    await expect(fetchTaxonInfo(-1)).resolves.toEqual({});
    await expect(fetchTaxonInfo(1.5)).resolves.toEqual({});
    await expect(fetchTaxonInfo(NaN)).resolves.toEqual({});
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Caching                                                             */
/* ------------------------------------------------------------------ */

describe('fetchTaxonInfo — caching', () => {
  it('hits the network at most once per taxon in a session', async () => {
    fetchMock().mockResolvedValue(okWith(7_000, OAK_ANCESTORS));
    await fetchTaxonInfo(TAXON);
    await fetchTaxonInfo(TAXON);
    await fetchTaxonInfo(TAXON);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('survives a cold start via AsyncStorage (no second request)', async () => {
    fetchMock().mockResolvedValue(okWith(7_000, OAK_ANCESTORS));
    await fetchTaxonInfo(TAXON);

    __clearObservationsMemCache(); // simulate a fresh app launch
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({
      observationsCount: 7_000,
      family: 'Fagaceae',
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('caches a "nothing usable" miss so it is not retried', async () => {
    fetchMock().mockResolvedValue(okWith(undefined));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a transport failure — the next catch retries', async () => {
    fetchMock().mockRejectedValueOnce(new Error('offline'));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});

    fetchMock().mockResolvedValue(okWith(9_100, OAK_ANCESTORS));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({
      observationsCount: 9_100,
      family: 'Fagaceae',
    });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it('refetches a stale entry so rarity/family are not frozen forever', async () => {
    const ancient = Date.now() - 400 * 24 * 60 * 60 * 1000; // > 30-day TTL
    await AsyncStorage.setItem(
      `inatObs:v1:${TAXON}`,
      JSON.stringify({ c: 1_000, f: 'OldFamily', t: ancient }),
    );

    fetchMock().mockResolvedValue(okWith(180_000, OAK_ANCESTORS));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({
      observationsCount: 180_000,
      family: 'Fagaceae',
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh AsyncStorage entry without any request', async () => {
    await AsyncStorage.setItem(
      `inatObs:v1:${TAXON}`,
      JSON.stringify({ c: 55_000, f: 'Fagaceae', t: Date.now() }),
    );
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({
      observationsCount: 55_000,
      family: 'Fagaceae',
    });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('treats a pre-existing cache entry without `f` as family-unknown (backward compat)', async () => {
    // Entries written before family-tracking existed have no `f` key at all.
    await AsyncStorage.setItem(`inatObs:v1:${TAXON}`, JSON.stringify({ c: 55_000, t: Date.now() }));
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({ observationsCount: 55_000 });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('treats the legacy sentinel-string cache form as a permanent miss with no family', async () => {
    await AsyncStorage.setItem(`inatObs:v1:${TAXON}`, '__miss__');
    await expect(fetchTaxonInfo(TAXON)).resolves.toEqual({});
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
