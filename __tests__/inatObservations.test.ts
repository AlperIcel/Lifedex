/**
 * Tests for the taxon observation-count lookup + cache (src/lib/inatObservations.ts).
 *
 * `fetch` is mocked — NO network happens. These cover the three things that
 * matter about this module:
 *   1. Privacy: the request carries a taxon id and nothing else.
 *   2. Best-effort: every failure mode resolves to undefined instead of throwing,
 *      so a lookup can never block or fail a catch.
 *   3. Caching: one request per species, misses cached, transport failures NOT
 *      cached, entries expire.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __clearObservationsMemCache,
  fetchObservationsCount,
} from '@/lib/inatObservations';

const TAXON = 12_345;
const URL = `https://api.inaturalist.org/v1/taxa/${TAXON}`;

type FetchMock = jest.Mock;
const fetchMock = (): FetchMock => globalThis.fetch as unknown as FetchMock;

function okWith(count: unknown): { ok: true; status: number; json: () => Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [{ observations_count: count }] }),
  };
}

beforeEach(async () => {
  __clearObservationsMemCache();
  await AsyncStorage.clear();
  (globalThis as { fetch?: unknown }).fetch = jest.fn();
});

/* ------------------------------------------------------------------ */
/* Happy path                                                          */
/* ------------------------------------------------------------------ */

describe('fetchObservationsCount — happy path', () => {
  it('returns the global observation count', async () => {
    fetchMock().mockResolvedValue(okWith(42_000));
    await expect(fetchObservationsCount(TAXON)).resolves.toBe(42_000);
  });

  it('floors a fractional count so it satisfies the integer schema', async () => {
    fetchMock().mockResolvedValue(okWith(1234.7));
    await expect(fetchObservationsCount(TAXON)).resolves.toBe(1234);
  });
});

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

describe('fetchObservationsCount — privacy', () => {
  it('sends ONLY the taxon id: no body, no coordinates, no auth', async () => {
    fetchMock().mockResolvedValue(okWith(1_000));
    await fetchObservationsCount(TAXON);

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

describe('fetchObservationsCount — best effort', () => {
  it('resolves undefined when the network is down (never throws)', async () => {
    fetchMock().mockRejectedValue(new Error('offline'));
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();
  });

  it('resolves undefined on an HTTP error', async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();
  });

  it('resolves undefined on a malformed body', async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();
  });

  it('resolves undefined when iNat reports a nonsense count', async () => {
    fetchMock().mockResolvedValue(okWith(-5));
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();
  });

  it('rejects an invalid taxon id without touching the network', async () => {
    await expect(fetchObservationsCount(0)).resolves.toBeUndefined();
    await expect(fetchObservationsCount(-1)).resolves.toBeUndefined();
    await expect(fetchObservationsCount(1.5)).resolves.toBeUndefined();
    await expect(fetchObservationsCount(NaN)).resolves.toBeUndefined();
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Caching                                                             */
/* ------------------------------------------------------------------ */

describe('fetchObservationsCount — caching', () => {
  it('hits the network at most once per taxon in a session', async () => {
    fetchMock().mockResolvedValue(okWith(7_000));
    await fetchObservationsCount(TAXON);
    await fetchObservationsCount(TAXON);
    await fetchObservationsCount(TAXON);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('survives a cold start via AsyncStorage (no second request)', async () => {
    fetchMock().mockResolvedValue(okWith(7_000));
    await fetchObservationsCount(TAXON);

    __clearObservationsMemCache(); // simulate a fresh app launch
    await expect(fetchObservationsCount(TAXON)).resolves.toBe(7_000);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('caches a "no count" miss so it is not retried', async () => {
    fetchMock().mockResolvedValue(okWith(undefined));
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a transport failure — the next catch retries', async () => {
    fetchMock().mockRejectedValueOnce(new Error('offline'));
    await expect(fetchObservationsCount(TAXON)).resolves.toBeUndefined();

    fetchMock().mockResolvedValue(okWith(9_100));
    await expect(fetchObservationsCount(TAXON)).resolves.toBe(9_100);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it('refetches a stale entry so rarity is not frozen forever', async () => {
    const ancient = Date.now() - 400 * 24 * 60 * 60 * 1000; // > 30-day TTL
    await AsyncStorage.setItem(
      `inatObs:v1:${TAXON}`,
      JSON.stringify({ c: 1_000, t: ancient }),
    );

    fetchMock().mockResolvedValue(okWith(180_000));
    await expect(fetchObservationsCount(TAXON)).resolves.toBe(180_000);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh AsyncStorage entry without any request', async () => {
    await AsyncStorage.setItem(
      `inatObs:v1:${TAXON}`,
      JSON.stringify({ c: 55_000, t: Date.now() }),
    );
    await expect(fetchObservationsCount(TAXON)).resolves.toBe(55_000);
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
