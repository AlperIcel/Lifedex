/**
 * PlantNet identify client — HTTP/multipart plumbing only.
 *
 * PlantNet's `/v2/identify/{project}` endpoint takes a multipart/form-data body
 * with one or more `images` parts plus a matching `organs` part naming the plant
 * organ shown ('leaf' | 'flower' | 'fruit' | 'bark' | 'auto'). We always send a
 * single image with organs='auto' and let the server pick.
 *
 * PRIVACY (hard invariant): this request carries the PHOTO AND NOTHING ELSE.
 * No GPS coordinates, no location, no timestamp, no device or user identifier is
 * ever attached — not as a form field, not as a query parameter, not as a header.
 * PlantNet's API does accept observation metadata; we deliberately never send it,
 * because a sighting's coordinates are the single most sensitive thing this app
 * holds (protected species must never be locatable). If you extend this file,
 * do not add anything to the FormData except the image and `organs`.
 *
 * React Native's fetch accepts a `{ uri, name, type }` object as a FormData part
 * and streams the file itself, so no base64 read is needed here.
 */
import { supabase } from '@/lib/supabase';
import type { PlantNetResponse } from './plantnetMapping';

/** "all" = the global flora project; the widest species coverage PlantNet has. */
const ENDPOINT = 'https://my-api.plantnet.org/v2/identify/all';

export interface PlantNetClientOptions {
  /** PlantNet API key. Used only for the DIRECT call (ignored when proxied). */
  apiKey?: string;
  /** Off-device proxy URL. Preferred — keeps the API key off the device. */
  proxyUrl?: string;
}

/**
 * React Native's FormData accepts a file descriptor object; the DOM lib types it
 * as Blob. This narrow cast keeps that platform quirk in one documented place.
 */
interface RNFilePart {
  uri: string;
  name: string;
  type: string;
}

function filePart(uri: string): RNFilePart {
  return { uri, name: 'photo.jpg', type: 'image/jpeg' };
}

/**
 * Identify the plant in `imageUri`.
 *
 * @throws Error when neither a proxy URL nor an API key is configured, or when
 *   the API answers with a non-2xx status. Errors propagate on purpose — the
 *   caller (the composite provider) decides on the fallback.
 */
export async function identify(
  imageUri: string,
  opts: PlantNetClientOptions,
): Promise<PlantNetResponse> {
  const useProxy = opts.proxyUrl !== undefined && opts.proxyUrl.length > 0;

  if (!useProxy && (opts.apiKey === undefined || opts.apiKey.length === 0)) {
    throw new Error('PlantNet: no proxy URL and no API key configured');
  }

  const url = useProxy
    ? (opts.proxyUrl as string)
    : `${ENDPOINT}?api-key=${encodeURIComponent(opts.apiKey as string)}`;

  const form = new FormData();
  // The image, and the organ hint. NOTHING ELSE — see the privacy note above.
  form.append('images', filePart(imageUri) as unknown as Blob);
  form.append('organs', 'auto');

  // Content-Type is intentionally NOT set: the runtime must add the multipart
  // boundary itself, and an explicit header would clobber it.
  const headers: Record<string, string> = {};

  if (useProxy && supabase !== null) {
    // Send the session token so the (JWT-verified) proxy only serves signed-in
    // devices instead of the open internet burning the owner's PlantNet quota.
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    } catch {
      // best-effort — the proxy will reject the call if it requires auth
    }
  }

  const resp = await fetch(url, { method: 'POST', headers, body: form });

  if (!resp.ok) {
    throw new Error(`PlantNet API error ${resp.status}`);
  }

  return (await resp.json()) as PlantNetResponse;
}
