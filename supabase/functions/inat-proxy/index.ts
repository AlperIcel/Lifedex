// LifeDex — iNaturalist Computer Vision proxy with server-side token auto-refresh
// (Supabase Edge Function, Deno).
//
// Forwards a multipart `score_image` request to iNaturalist's CV API, injecting a
// FRESH iNaturalist JWT that the proxy mints and refreshes itself — so the app
// never holds a token, and nothing expires from the user's point of view. The
// personal api_token JWT is only valid ~24h; this proxy keeps a stable OAuth
// credential and re-mints the JWT server-side before it expires.
//
// Auth source (first configured wins):
//   1. INAT_OAUTH_ACCESS_TOKEN   — a long-lived iNaturalist OAuth access token
//        (RECOMMENDED: no password stored). The proxy exchanges it for a fresh
//        24h api_token JWT via /users/api_token and caches that.
//   2. INAT_OAUTH_CLIENT_ID + INAT_OAUTH_CLIENT_SECRET + INAT_USERNAME +
//        INAT_PASSWORD — self-healing password grant: the proxy gets an access
//        token, then the JWT. Use only if you accept storing the account password
//        as a server secret.
//   3. INATURALIST_API_TOKEN     — legacy: a manual 24h JWT, used as-is with NO
//        refresh (the old behaviour; it will still expire in ~24h).
//
// Deploy:
//   supabase functions deploy inat-proxy
//   supabase secrets set INAT_OAUTH_ACCESS_TOKEN=<token>       # option 1 (recommended)
//   # OR: supabase secrets set INAT_OAUTH_CLIENT_ID=… INAT_OAUTH_CLIENT_SECRET=… \
//   #                          INAT_USERNAME=… INAT_PASSWORD=…  # option 2
// Then in the app .env: INAT_PROXY_URL=https://<project>.functions.supabase.co/inat-proxy
// and REMOVE INATURALIST_API_TOKEN from the client .env.
//
// NOTE: this file is Deno (excluded from the app's tsconfig). Don't import it from app code.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const CV_ENDPOINT = 'https://api.inaturalist.org/v1/computervision/score_image';
const OAUTH_TOKEN_URL = 'https://www.inaturalist.org/oauth/token';
const API_TOKEN_URL = 'https://www.inaturalist.org/users/api_token';
/** Re-mint the JWT this long before its exp so a request never rides an expired token. */
const REFRESH_BUFFER_MS = 60 * 60 * 1000; // 1h

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const env = (k: string): string | undefined => {
  const v = Deno.env.get(k);
  return v !== undefined && v.length > 0 ? v : undefined;
};

/* ------------------------------------------------------------------ */
/* Token minting + cache                                              */
/* ------------------------------------------------------------------ */

// Module-level cache — reused across requests on a warm instance. A cold start
// mints one fresh JWT (cheap). TODO(scale): persist in a table/Deno.KV so many
// cold starts don't each hit /users/api_token.
let cache: { jwt: string; expiresAt: number } | null = null;
// Single-flight guard so concurrent requests don't all mint at once.
let inFlight: Promise<string> | null = null;

/** Read the `exp` (seconds) claim from a JWT, in ms; null if unreadable. */
function jwtExpMs(jwt: string): number | null {
  try {
    const seg = jwt.split('.')[1];
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(seg.length / 4) * 4, '=');
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Obtain an OAuth access token: a stored one, else a password-grant exchange. */
async function getAccessToken(): Promise<string> {
  const direct = env('INAT_OAUTH_ACCESS_TOKEN');
  if (direct !== undefined) return direct;

  const clientId = env('INAT_OAUTH_CLIENT_ID');
  const clientSecret = env('INAT_OAUTH_CLIENT_SECRET');
  const username = env('INAT_USERNAME');
  const password = env('INAT_PASSWORD');
  if (clientId && clientSecret && username && password) {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password,
    });
    const r = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) throw new Error(`oauth token ${r.status}`);
    const j = await r.json();
    if (typeof j.access_token !== 'string') throw new Error('oauth: no access_token');
    return j.access_token;
  }

  throw new Error('proxy misconfigured: no iNaturalist OAuth credentials');
}

/** Exchange the OAuth access token for a fresh ~24h api_token JWT. */
async function mintJwt(): Promise<string> {
  const access = await getAccessToken();
  const r = await fetch(API_TOKEN_URL, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`api_token ${r.status}`);
  const j = await r.json();
  if (typeof j.api_token !== 'string') throw new Error('api_token: missing');
  return j.api_token;
}

/** A valid JWT, from cache when fresh, otherwise (re-)minted. Single-flight. */
async function getFreshJwt(): Promise<string> {
  // Legacy: a manually-set fixed token is used as-is (still expires in ~24h).
  const manual = env('INATURALIST_API_TOKEN');
  if (manual !== undefined) return manual;

  const now = Date.now();
  if (cache !== null && cache.expiresAt - now > REFRESH_BUFFER_MS) return cache.jwt;

  if (inFlight === null) {
    inFlight = (async () => {
      try {
        const jwt = await mintJwt();
        cache = { jwt, expiresAt: jwtExpMs(jwt) ?? now + 23 * 60 * 60 * 1000 };
        return jwt;
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
}

/* ------------------------------------------------------------------ */
/* Handler                                                            */
/* ------------------------------------------------------------------ */

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // Require a bearer token so this isn't an open relay for the owner's quota.
  // Deploy WITHOUT --no-verify-jwt so Supabase validates the caller JWT first;
  // this check is defense-in-depth (only signed-in devices get this far).
  //
  // TODO(rate-limit): add per-user rate limiting here before real scale — needs a
  // table/KV keyed on the caller's user id (from the verified JWT) to throttle.
  const auth = req.headers.get('Authorization');
  if (auth === null || !auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let jwt: string;
  try {
    jwt = await getFreshJwt();
  } catch (e) {
    return new Response(JSON.stringify({ error: `proxy auth: ${String(e)}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Pass the client's multipart body straight through, swapping in the fresh
    // server-side JWT. Binary body (a JPEG inside a multipart part) → raw bytes;
    // forward the incoming Content-Type verbatim (carries the multipart boundary).
    // The body is never inspected: whatever the client sent (image only — no
    // lat/lng, see inatClient.ts) is exactly what reaches iNat.
    const contentType = req.headers.get('Content-Type') ?? 'multipart/form-data';
    const body = await req.arrayBuffer();
    let resp = await fetch(CV_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Authorization: `Bearer ${jwt}` },
      body,
    });

    // If the cached JWT was rejected (e.g. revoked early), drop it and retry once
    // with a freshly minted one — unless we're on a legacy manual token.
    if (resp.status === 401 && env('INATURALIST_API_TOKEN') === undefined) {
      cache = null;
      const retryJwt = await getFreshJwt();
      resp = await fetch(CV_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${retryJwt}` },
        body,
      });
    }

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
