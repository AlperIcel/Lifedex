/**
 * Transport + PRIVACY regression tests for the iNaturalist CV client.
 *
 * The hard privacy invariant ("the photo and nothing else — never lat/lng") was
 * previously enforced only by a comment. These tests fail loudly if a future
 * change smuggles coordinates (or any extra field) into the request. fetch is
 * mocked; no network happens.
 */
import { scoreImage } from '../inatClient';

// Keep the client's proxy-auth path from touching a real Supabase session.
jest.mock('@/lib/supabase', () => ({ supabase: null }));

const OK = { ok: true, json: async () => ({ total_results: 0, results: [] }) };

describe('scoreImage — privacy + transport', () => {
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

  it('sends ONLY the image part — never lat/lng or other metadata', async () => {
    await scoreImage('file:///photo.jpg', { apiToken: 't' });
    const fields = appendSpy.mock.calls.map((c) => c[0]);
    expect(fields).toEqual(['image']);
    expect(fields).not.toContain('lat');
    expect(fields).not.toContain('lng');
  });

  it('POSTs to the iNat endpoint with a Bearer token on the direct path', async () => {
    await scoreImage('file:///photo.jpg', { apiToken: 'secret' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.inaturalist.org/v1/computervision/score_image');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret');
    // No GPS smuggled into the URL either.
    expect(String(url)).not.toMatch(/lat|lng/);
  });

  it('uses the proxy URL verbatim and never puts the raw token on the wire', async () => {
    await scoreImage('file:///photo.jpg', {
      proxyUrl: 'https://proxy.example/inat',
      apiToken: 'secret',
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://proxy.example/inat');
    // supabase is null → no Authorization header, and the apiToken never leaks.
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('throws on a non-OK response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(scoreImage('file:///photo.jpg', { apiToken: 't' })).rejects.toThrow(
      'iNaturalist CV API error 500',
    );
  });
});
