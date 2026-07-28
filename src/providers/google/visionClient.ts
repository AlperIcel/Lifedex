/**
 * Shared Google Vision annotate client.
 *
 * One annotate call requests ALL features (labels/objects/web for recognition,
 * faces/safe-search for moderation), so a single capture costs ONE API unit even
 * though the pipeline calls both the moderation and vision providers. The last
 * response is memoized by image URI so `moderate()` and `recognize()` for the
 * same photo share the call.
 *
 * base64 read is via expo-file-system; the request uses the plain API key.
 */
// SDK 54: expo-file-system v19 rewrote its API; readAsStringAsync + EncodingType
// live under the legacy entrypoint. Kept here rather than migrating to the new
// File API to keep the base64 read a one-line change.
import * as FileSystem from 'expo-file-system/legacy';

import { env } from '@/config/env';
import { supabase } from '@/lib/supabase';
import type { VisionAnnotateResponse } from './visionMapping';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

const FEATURES = [
  { type: 'LABEL_DETECTION', maxResults: 10 },
  { type: 'OBJECT_LOCALIZATION', maxResults: 8 },
  { type: 'WEB_DETECTION', maxResults: 5 },
  { type: 'FACE_DETECTION', maxResults: 5 },
  { type: 'SAFE_SEARCH_DETECTION' },
];

let cache: { key: string; promise: Promise<VisionAnnotateResponse> } | null = null;

async function doAnnotate(imageUri: string, apiKey: string): Promise<VisionAnnotateResponse> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Prefer the server-side proxy (key stays off-device); else call Google directly.
  const useProxy = env.visionProxyUrl !== undefined;
  const url = env.visionProxyUrl ?? `${ENDPOINT}?key=${apiKey}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (useProxy && supabase !== null) {
    // Send the anon session token so the proxy (JWT-verified) only serves signed-in
    // devices — not the open internet burning the owner's Vision budget.
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    } catch {
      // best-effort — proxy will reject if it requires auth
    }
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: FEATURES }] }),
  });

  if (!resp.ok) {
    throw new Error(`Google Vision API error ${resp.status}`);
  }

  const json = (await resp.json()) as { responses?: VisionAnnotateResponse[] };
  return json.responses?.[0] ?? {};
}

/**
 * Annotate an image, sharing one API call between recognition and moderation of
 * the same capture. Memoizes only the most recent image URI.
 */
export function annotate(imageUri: string, apiKey: string): Promise<VisionAnnotateResponse> {
  if (cache !== null && cache.key === imageUri) return cache.promise;
  const promise = doAnnotate(imageUri, apiKey);
  cache = { key: imageUri, promise };
  // Don't cache a rejection — a retry (or the other provider) should re-fetch.
  void promise.catch(() => {
    if (cache !== null && cache.key === imageUri) cache = null;
  });
  return promise;
}
