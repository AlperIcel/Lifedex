/**
 * Transport + PRIVACY regression tests for the PlantNet identify client.
 *
 * The hard privacy invariant ("photo and `organs` only — no GPS/location/
 * timestamp/device id, ever") was previously enforced only by a comment. These
 * tests fail loudly if a future change adds any extra field. fetch is mocked.
 */
import { identify } from '../plantnetClient';

jest.mock('@/lib/supabase', () => ({ supabase: null }));

const OK = { ok: true, json: async () => ({ results: [] }) };

describe('identify — privacy + transport', () => {
  const realFetch = global.fetch;
  let appendSpy: jest.SpyInstance;

  beforeEach(() => {
    appendSpy = jest.spyOn(FormData.prototype, 'append');
    global.fetch = jest.fn().mockResolvedValue(OK) as unknown as typeof fetch;
  });
  afterEach(() => {
    appendSpy.mockRestore();
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('sends ONLY the image and organs parts — no location/metadata', async () => {
    await identify('file:///photo.jpg', { apiKey: 'k' });
    const fields = appendSpy.mock.calls.map((c) => c[0]);
    expect(fields).toEqual(['images', 'organs']);
    for (const forbidden of ['lat', 'lng', 'latitude', 'longitude', 'location', 'timestamp']) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it('builds the direct URL with the api-key query param', async () => {
    await identify('file:///photo.jpg', { apiKey: 'my key/&' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://my-api.plantnet.org/v2/identify/all?api-key=my%20key%2F%26',
    );
    expect(init.method).toBe('POST');
  });

  it('uses the proxy URL verbatim and never puts the raw key on the wire', async () => {
    await identify('file:///photo.jpg', {
      proxyUrl: 'https://proxy.example/plantnet',
      apiKey: 'secret',
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://proxy.example/plantnet');
    expect(String(url)).not.toContain('secret');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('throws when neither a proxy URL nor an API key is configured', async () => {
    await expect(identify('file:///photo.jpg', {})).rejects.toThrow(
      'no proxy URL and no API key',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(identify('file:///photo.jpg', { apiKey: 'k' })).rejects.toThrow(
      'PlantNet API error 429',
    );
  });
});
