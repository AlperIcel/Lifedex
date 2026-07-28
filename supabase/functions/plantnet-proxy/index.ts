// LifeDex — PlantNet identify proxy (Supabase Edge Function, Deno).
//
// Forwards a multipart `/v2/identify/all` request to PlantNet, injecting the API
// key from a server-side secret so the key NEVER ships inside the app bundle. The
// app posts the same multipart body it would send to PlantNet directly — the
// `images` + `organs` parts only (see plantnetClient.ts, which deliberately never
// attaches GPS, timestamp, or any identifier); this function appends the key as
// PlantNet's `?api-key=` query param and returns PlantNet's response verbatim.
//
// Deploy:
//   supabase functions deploy plantnet-proxy
//   supabase secrets set PLANTNET_API_KEY=<your key>
// Then in the app .env: PLANTNET_PROXY_URL=https://<project>.functions.supabase.co/plantnet-proxy
// and REMOVE PLANTNET_API_KEY from the client .env.
//
// NOTE: this file is Deno (excluded from the app's tsconfig). Don't import it from app code.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const ENDPOINT = 'https://my-api.plantnet.org/v2/identify/all';

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
  // forgotten, not a blocker for the key-off-device fix this function exists for.
  const auth = req.headers.get('Authorization');
  if (auth === null || !auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const key = Deno.env.get('PLANTNET_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'proxy misconfigured (no key)' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Pass the client's multipart body straight through to PlantNet, appending
    // the server-side key to the URL (PlantNet's own auth scheme — it does not
    // use an Authorization header). The body is binary (a JPEG inside a
    // multipart part), so read it as raw bytes rather than text — and forward
    // the incoming Content-Type verbatim, since it carries the multipart
    // boundary PlantNet needs to parse the body. We never inspect or modify the
    // body itself: whatever parts the client sent (images + organs only — no
    // GPS, no metadata, see plantnetClient.ts) are exactly what reaches PlantNet.
    const contentType = req.headers.get('Content-Type') ?? 'multipart/form-data';
    const body = await req.arrayBuffer();
    const resp = await fetch(`${ENDPOINT}?api-key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
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
