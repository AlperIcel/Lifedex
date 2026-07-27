/**
 * iNaturalist Computer Vision HTTP client (plumbing only).
 *
 * `scoreImage` POSTs a captured photo to iNat's `score_image` endpoint (or an
 * off-device proxy) and returns the parsed `InatScoreResponse`. All classification
 * lives in inatMapping.ts — this module only does the network call.
 *
 * PRIVACY — HARD INVARIANT:
 *   The iNat endpoint *optionally* accepts `lat`/`lng` to improve scoring using
 *   the observation location. We DELIBERATELY NEVER SEND THEM. Exact GPS must
 *   never leave the device (see CLAUDE.md privacy invariants). The recognize()
 *   contract carries no geodata anyway, but this is called out here so nobody
 *   "improves accuracy" by adding coordinates later.
 *
 * Multipart upload: React Native's `fetch` accepts a FormData whose field value
 * is `{ uri, name, type }`; RN streams the file directly from the `file://` URI,
 * so no base64 read is needed. `Content-Type` (with boundary) is set by fetch.
 */
import { env } from '@/config/env';
import { supabase } from '@/lib/supabase';
import type { InatScoreResponse } from './inatMapping';

/** Direct iNaturalist CV endpoint (used when no proxy is configured). */
const INAT_ENDPOINT = 'https://api.inaturalist.org/v1/computervision/score_image';

/** Options controlling where the request goes and how it authenticates. */
export interface ScoreImageOptions {
  /** iNat API token (Bearer). Sent to the direct endpoint when no proxy is set. */
  apiToken?: string;
  /**
   * Optional server-side proxy URL. When set, the request goes to the proxy
   * instead of iNat directly, so the API token never ships in the client bundle.
   */
  proxyUrl?: string;
}

/**
 * RN FormData file part shape. Typed locally because the DOM `FormData.append`
 * lib types don't model React Native's `{ uri, name, type }` blob substitute.
 */
interface RNFilePart {
  uri: string;
  name: string;
  type: string;
}

/**
 * Score a captured image against iNat's CV model.
 *
 * @param imageUri  The captured photo URI (`file://…`). Streamed as multipart.
 * @param opts      Token + optional proxy URL.
 * @throws Error when the response status is not OK.
 */
export async function scoreImage(
  imageUri: string,
  opts: ScoreImageOptions,
): Promise<InatScoreResponse> {
  const form = new FormData();
  const filePart: RNFilePart = {
    uri: imageUri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  };
  // NOTE: no `lat`/`lng` fields — exact GPS never leaves the device (see header).
  form.append('image', filePart as unknown as Blob);

  const useProxy = opts.proxyUrl !== undefined;
  const url = opts.proxyUrl ?? INAT_ENDPOINT;

  // Let fetch set the multipart Content-Type (with boundary) itself.
  const headers: Record<string, string> = {};

  if (useProxy) {
    // Proxy path: attach the Supabase anon session token so the (JWT-verified)
    // proxy only serves signed-in devices — not the open internet burning the
    // owner's iNat budget. Best-effort; the proxy rejects if it requires auth.
    if (supabase !== null) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token !== undefined) headers.Authorization = `Bearer ${token}`;
      } catch {
        // best-effort — proxy enforces its own auth policy
      }
    }
  } else if (opts.apiToken !== undefined) {
    // Direct path: authenticate to iNat with the provided API token.
    headers.Authorization = `Bearer ${opts.apiToken}`;
  }

  const resp = await fetch(url, { method: 'POST', headers, body: form });
  if (!resp.ok) {
    throw new Error(`iNaturalist CV API error ${resp.status}`);
  }

  return (await resp.json()) as InatScoreResponse;
}

/** Re-export so callers can build default options from env without deep imports. */
export function optionsFromEnv(): ScoreImageOptions {
  return { apiToken: env.inatApiToken, proxyUrl: env.inatProxyUrl };
}
