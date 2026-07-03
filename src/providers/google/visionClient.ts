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
import * as FileSystem from 'expo-file-system';

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

  const resp = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  return promise;
}
