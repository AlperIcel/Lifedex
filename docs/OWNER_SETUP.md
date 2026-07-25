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

## 4. Production maps (future) — real map tiles
Needs a Google Maps key + a dev build (native maps don't render in Expo Go):
- Add `GOOGLE_MAPS_API_KEY` to `app.json` + set `MAPS_PROVIDER=google` in `.env`
  (flips `env.useNativeMaps`), then `npx expo run:android`.
Until then the app shows the stylised MockMapView (fully usable).

---
Everything above is guarded: the app is a complete, working experience before any
of these steps.
