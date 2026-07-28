// LifeDex — iNaturalist Computer Vision proxy (Supabase Edge Function, Deno).
//
// Forwards a multipart `score_image` request to iNaturalist's Computer Vision API,
// injecting the API token from a server-side secret so the token NEVER ships
// inside the app bundle. The app posts the same multipart body it would send to
// iNaturalist directly (just the `image` part — see inatClient.ts, which
// deliberately never attaches lat/lng); this function adds the Authorization
// header and returns iNat's response verbatim.
//
// Deploy:
//   supabase functions deploy inat-proxy
//   supabase secrets set INATURALIST_API_TOKEN=<your token>
// Then in the app .env: INAT_PROXY_URL=https://<project>.functions.supabase.co/inat-proxy
// and REMOVE INATURALIST_API_TOKEN from the client .env.
//
// NOTE: this file is Deno (excluded from the app's tsconfig). Don't import it from app code.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const ENDPOINT = 'https://api.inaturalist.org/v1/computervision/score_image';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // Require a bearer token so this isn't an open relay for the owner's paid quota.
  // Deploy WITHOUT --no-verify-jwt so Supabase validates the JWT before we run;
  // this check is defense-in-depth (only signed-in devices get this far).
  //
  // TODO(rate-limit): add per-user rate limiting here before any real scale — needs
  // a table/KV keyed on the caller's user id (from the verified JWT) to count and
  // throttle requests per window. Not implemented yet — documented so it isn't
  // forgotten, not a blocker for the token-off-device fix this function exists for.
  const auth = req.headers.get('Authorization');
  if (auth === null || !auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = Deno.env.get('INATURALIST_API_TOKEN');
  if (!token) {
    return new Response(JSON.stringify({ error: 'proxy misconfigured (no token)' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Pass the client's multipart body straight through to iNat, swapping in the
    // server-side token. The body is binary (a JPEG inside a multipart part), so
    // read it as raw bytes rather than text — and forward the incoming
    // Content-Type verbatim, since it carries the multipart boundary iNat needs
    // to parse the body. We never inspect or modify the body itself: whatever
    // parts the client sent (image only — no lat/lng, see inatClient.ts) are
    // exactly what reaches iNat.
    const contentType = req.headers.get('Content-Type') ?? 'multipart/form-data';
    const body = await req.arrayBuffer();
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        // Server-side secret — never the caller's own Authorization header.
        Authorization: `Bearer ${token}`,
      },
      body,
    });
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
