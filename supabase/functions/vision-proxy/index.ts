// LifeDex — Vision proxy (Supabase Edge Function, Deno).
//
// Forwards a Google Cloud Vision `images:annotate` request, injecting the API key
// from a server-side secret so the key NEVER ships inside the app bundle. The app
// posts the same body it would send to Google (minus the key); this function adds
// the key and returns Google's response verbatim.
//
// Deploy:
//   supabase functions deploy vision-proxy
//   supabase secrets set GOOGLE_CLOUD_VISION_KEY=<your key>
// Then in the app .env: VISION_PROXY_URL=https://<project>.functions.supabase.co/vision-proxy
// and REMOVE GOOGLE_CLOUD_VISION_KEY from the client .env.
//
// NOTE: this file is Deno (excluded from the app's tsconfig). Don't import it from app code.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

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

  const key = Deno.env.get('GOOGLE_CLOUD_VISION_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'proxy misconfigured (no key)' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Pass the client's annotate body straight through to Google with the key.
    const body = await req.text();
    const resp = await fetch(`${ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
