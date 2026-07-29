# LifeDex — Owner setup checklist

The app is **fully functional right now** in mock mode and with the Google Vision
key already in `.env`. Everything below is optional and unlocks a specific
feature; each is guarded, so nothing breaks while it's undone.

## Already done ✅
- Supabase project + `community_sightings` table + RLS (`supabase/community_sightings.sql`)
- Table grants for the API roles (`grant select/insert/update/delete ...`)
- Anonymous sign-ins enabled (Authentication → Sign In / Providers)
- Google Cloud Vision API enabled + key in local `.env` (`AI_PROVIDER=google`)

## 1. Community card images (public storage)  — unlocks real images in the feed
Other users currently see an emoji placeholder for your finds because the cropped
card lives only on your device. To share the actual card art:
1. Supabase → **SQL Editor** → run all of [`supabase/storage.sql`](../supabase/storage.sql).
   (Creates the public `card-images` bucket + RLS: public read, write-your-own-folder.)
That's it — the app uploads the crop to `card-images/{your-id}/{sighting}.jpg` and
publishes the public URL. Until then it safely skips the image (never uploads a
local path).

## 2. Named leaderboard — unlocks usernames on the ranking
1. Supabase → SQL Editor → run [`supabase/migrations/002_username.sql`](../supabase/migrations/002_username.sql).
The client already sends a username when the column exists (and silently skips it
otherwise).

## 3. Secure the Vision key (before any public release) — IMPORTANT
Right now the Vision key ships inside the app bundle (fine for private testing,
NOT for release — it can be extracted and abused on your bill). To proxy it:
1. Deploy the edge function (KEEP JWT verification on — do NOT pass
   `--no-verify-jwt`): `supabase functions deploy vision-proxy`
2. Set the secret server-side: `supabase secrets set GOOGLE_CLOUD_VISION_KEY=<key>`
3. In `.env`, set `VISION_PROXY_URL=https://<project>.functions.supabase.co/vision-proxy`
   and REMOVE `GOOGLE_CLOUD_VISION_KEY` from the client `.env`.
The client uses the proxy when `VISION_PROXY_URL` is set (and now sends the anon
session token), else the direct key. With JWT verification on, only signed-in
devices can call it — not the open internet. Add per-user rate limiting in the
function before any real scale.
*(Function code + this wiring land in a follow-up slice; documented here so the
security step isn't forgotten.)*

## 4. Recognition proxies (keep tokens off-device) — IMPORTANT, before any public release
Same problem as the Vision key: if `INATURALIST_API_TOKEN` / `PLANTNET_API_KEY` are
set in the client `.env`, they ship inside the app bundle and can be extracted and
abused on your bill. Two edge functions mirror the `vision-proxy` pattern —
`inat-proxy` and `plantnet-proxy` — each verifies the caller's Supabase JWT, then
forwards the multipart photo body to the real API with the token/key attached
server-side, and returns the response verbatim. Neither function reads or forwards
anything beyond the image (no GPS, no extra fields).
1. Deploy both functions (KEEP JWT verification on — do NOT pass
   `--no-verify-jwt`):
   ```
   supabase functions deploy inat-proxy
   supabase functions deploy plantnet-proxy
   ```
2. Set the secrets server-side. PlantNet uses a stable key. For iNaturalist,
   prefer the AUTO-REFRESH path so the token never expires again — the personal
   api_token JWT lasts only ~24h, and the proxy re-mints it itself from a stable
   OAuth credential (no more daily token swapping):
   ```
   # PlantNet (stable key)
   supabase secrets set PLANTNET_API_KEY=<your PlantNet key>

   # iNaturalist — pick ONE:
   # (a) RECOMMENDED: a long-lived OAuth access token (no password stored)
   supabase secrets set INAT_OAUTH_ACCESS_TOKEN=<access_token>

   # (b) Self-healing password grant (proxy mints its own tokens; stores password)
   supabase secrets set INAT_OAUTH_CLIENT_ID=<id> INAT_OAUTH_CLIENT_SECRET=<secret> \
                        INAT_USERNAME=<inat login> INAT_PASSWORD=<inat password>

   # (c) LEGACY: a manual 24h JWT — works but STILL expires daily (dev only)
   supabase secrets set INATURALIST_API_TOKEN=<your 24h token>
   ```
   For option (a): register an app at **inaturalist.org/oauth/applications**, then
   fetch an access token ONCE (paste the JSON's `access_token` into the secret):
   ```
   curl -X POST https://www.inaturalist.org/oauth/token \
     -d grant_type=password -d client_id=<id> -d client_secret=<secret> \
     -d username=<login> -d password=<password>
   ```
   With (a) or (b) the proxy caches the 24h JWT and refreshes it ~1h before expiry
   (and retries once on a 401), so the app never sees a token and nothing expires.
3. In `.env`, point the app at the deployed function URLs and remove the raw
   credentials:
   ```
   INAT_PROXY_URL=https://<project>.functions.supabase.co/inat-proxy
   PLANTNET_PROXY_URL=https://<project>.functions.supabase.co/plantnet-proxy
   ```
   then REMOVE `INATURALIST_API_TOKEN` and `PLANTNET_API_KEY` from the client
   `.env`. The clients already prefer the proxy (and send the signed-in user's
   session token) whenever its URL is set — see `inatClient.ts` /
   `plantnetClient.ts` — falling back to the direct API + raw credential only
   when no proxy URL is configured.
With JWT verification on, only signed-in devices can call either proxy — not the
open internet. Both functions leave per-user rate limiting as a documented `TODO`
(needs a table/KV to count and throttle by caller id) — add it before any real
scale.

## 5. Production maps (future) — real map tiles
Needs a Google Maps key + a dev build (native maps don't render in Expo Go):
- Add `GOOGLE_MAPS_API_KEY` to `app.json` + set `MAPS_PROVIDER=google` in `.env`
  (flips `env.useNativeMaps`), then `npx expo run:android`.
Until then the app shows the stylised MockMapView (fully usable).

---
Everything above is guarded: the app is a complete, working experience before any
of these steps.
