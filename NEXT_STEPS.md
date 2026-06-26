# Next Steps

This document tracks what is currently mocked versus real, and the ordered backlog for making LifeDex production-ready.

---

## What is mocked vs real

| Capability | Status | Mock behaviour / notes |
|---|---|---|
| Vision / species recognition | Mock (clearly labelled) | `MockVisionProvider` — deterministic djb2 hash of image URI selects from the species table. Same URI always returns same species. **The simulated nature is shown in-app**: a "Simulated result" banner on `ResultScreen` and a test-subject picker (Auto/Cat/Dog/Frog/Bird/Tree/Flower/Mushroom) on `CaptureScreen`, both gated on `env.isMockAi`. The picker passes an optional `hint`/`mockSpecies` that only the mock provider reads — **real AI recognition arrives as a pure provider swap** (`getProviders()` returns a real adapter; the hint is ignored, banner and picker disappear). |
| Image moderation | Mock | `MockModerationProvider` — reads URI keyword substrings (`face`, `person`, `plate`, `blur`, `dark`, `interior`) to simulate detector signals. |
| Card image generation | Mock | `MockCardGenProvider` — returns `mock-card://<category>/<slug>/<rarity>/<xp>`. `MockCardImage` component renders an emoji placeholder. No network call. |
| Location / GPS | Real (Expo Location) | `Location.getCurrentPositionAsync()` called by `CaptureScreen` before `createSightingFromImage`. Falls back to `{lat:0,lng:0}` if permission denied. |
| Location privacy / fuzzing | Real | `DefaultLocationPrivacyProvider` and `getPublicLocation()` run on the real GPS point inside `sightingPipeline.ts`. No mock path. |
| Scoring engine | Real | `scoreSighting()` and `DefaultRarityScoringProvider` are fully deterministic domain functions. No mock path. Used in both the pipeline and the seed. |
| Card metadata builder | Real | `buildCardMetadata()` is a pure function. Used in both the pipeline and the seed. |
| Capture pipeline | Real (mock providers) | `sightingPipeline.createSightingFromImage()` runs the full pipeline end-to-end. With `AI_PROVIDER=mock` all providers are mock; with a real provider key the same function works without changes. |
| App state / storage | Local (AsyncStorage) | `useLifeDexStore` singleton — seeded from the species table at startup, then `hydrate()` merges persisted USER captures on top. New captures are written to AsyncStorage (`src/store/persistence.ts`) and **survive app restart**. Only user captures persist; the seed is re-loaded fresh each launch. No Supabase writes yet. |
| Auth | Not built | No sign-in flow. `currentUserId` is hardcoded `'mock-user-001'`. Supabase Auth is wired in schema/policies but the app has no login screen yet. |
| Map data | Mock (reactive) | `MapScreen` reads `useLifeDexStore().sightings` — reactive, includes newly captured sightings within the session. Seeded with 15 entries. No Supabase query. |
| Map rendering | Mock fallback by default | Native `react-native-maps` renders a blank tile layer in Expo Go / emulators without a Google Maps key, so `MapScreen` shows `MockMapView` — a stylised surface that projects sightings (pins for visible, **circles-only for protected**, no exact point) using their bounding box. Native path is gated behind `env.useNativeMaps` (false in mock mode). Set `MAPS_PROVIDER` to a real provider + key + dev build to enable native. |
| Collection data | Mock (reactive) | `CollectionScreen` reads `useLifeDexStore().collectionCards` — seeded with 15 cards + grows with captures. No Supabase query. |
| Leaderboard data | Mock | `MOCK_LEADERBOARD` seeded into `lifeDexStore` from `src/screens/leaderboard/mockData.ts` — 15 static entries. |
| Duplicate detection | Not built | `ScoreInput.isDuplicate` is always `false` in mock mode. |
| Streak tracking | Not built | `ScoreInput.streak` is always `0` in mock mode. |
| Push notifications | Not built | No Expo Notifications integration yet. |
| EAS build | Not built | No `eas.json` config. |

---

## Ordered backlog

### 1. Wire real Vision and Moderation adapters

**Goal:** replace `MockVisionProvider` and `MockModerationProvider` with adapters that call a real AI API.

**Approach:**
- Create `src/providers/google/` (or `openai/`, `replicate/`) implementing `VisionRecognitionProvider` and `ImageModerationProvider`.
- `getProviders()` in `src/providers/index.ts` reads `env.aiProvider` and returns the real adapter when it is not `'mock'`.
- The domain functions (`decideModeration`, `scoreSighting`) need no changes — they are provider-agnostic.
- Recommended first choices:
  - Vision: Google Cloud Vision API (species label detection + web detection for scientific names) or iNaturalist API (taxonomy-aware, better for wildlife).
  - Moderation: Google Cloud Vision SafeSearch + face/object detection, or AWS Rekognition.
- Set `AI_PROVIDER=google` (or your chosen value) in `.env` and add the required key (e.g. `GOOGLE_CLOUD_VISION_KEY`).
- Add the new env-var to `.env.example` and to the env-var table in `README.md`.

**Acceptance:** the capture pipeline runs end-to-end against a real photo of an animal without mock providers.

---

### 2. Wire real Card Generation adapter

**Goal:** replace `MockCardGenProvider` with a real image generation adapter.

**Approach:**
- Create `src/providers/replicate/` (or `openai/`, `stability/`) implementing `CardImageGenerationProvider`.
- The interface receives `CardMetadata` and `RecognitionResult` — build a prompt from `meta.name`, `meta.rarity`, `meta.category`, `recognition.scientificName`, and any descriptive stats.
- The provider uploads the generated image to Supabase `card-images/{user_id}/{sighting_id}/card.png` and returns its public URL as `publicImageUri`.
- `MockCardImage` detects `mock-card://` URIs. Once real URIs are in use (starting with `https://`), it renders a standard `<Image>` automatically — no component changes needed.
- Keep the mock provider active for local development (`AI_PROVIDER=mock`).

**Acceptance:** the result screen shows a real AI-generated card image for a captured species.

---

### 3. Supabase project + RLS deploy

**Goal:** upgrade local-only persistence to multi-user Supabase persistence (server-side storage + shared/public sightings).

The store already persists user captures locally via AsyncStorage (`src/store/persistence.ts`), so this is the next layer, not a from-scratch change. The consolidated store keeps it a single swap point: `lifeDexStore.addSighting()` writes to the in-memory state + local storage today. Add a Supabase insert alongside (and seed/read paths from Supabase queries) to make captures server-backed and visible across users — without touching any screen.

**Steps:**
1. Follow the "Supabase setup" section in `README.md`.
2. Add `@supabase/supabase-js` to dependencies (`npm install @supabase/supabase-js`).
3. Create `src/lib/supabase.ts` that constructs the Supabase client from `env.supabaseUrl` and `env.supabaseAnonKey` (guard for undefined — only defined when not in mock mode).
4. In `useLifeDexStore.ts`, add a Supabase insert into `sightings` alongside the existing local write in `addSighting`; replace the seed load (and `hydrate()` local read) with a Supabase query on `public_sightings`. Keep AsyncStorage as the offline cache.
5. Replace `leaderboardEntries` seed with a query on the `leaderboard` view.
6. `sightingPipeline.ts` needs no changes — it already calls `lifeDexStore.addSighting()`.
7. All screens need no changes — they already read from `useLifeDexStore()`.

**Auth prerequisite:** Auth must be built first (step 4 below), because `sightings.user_id` must match `auth.uid()` for RLS to allow the insert.

---

### 4. Auth flow (sign-up / sign-in)

**Goal:** add user authentication so Supabase RLS works.

**Approach:**
- Add an `AuthScreen` to `RootStackParamList` between `Onboarding` and `Tabs`.
- Use `@supabase/supabase-js` `signInWithOTP` (magic link / SMS) or `signInWithPassword`.
- On first sign-in, insert a row into `profiles` with the `auth.uid()` as `id`.
- Store the session in `AsyncStorage` via `supabase.auth.setSession()` / `supabase.auth.onAuthStateChange()`.
- Gate all Supabase queries behind an authenticated session check.

---

### 5. Maps token

**Goal:** replace the mock map with real tiles.

**Steps:**
- Obtain a Google Maps API key with Maps SDK for Android and Maps SDK for iOS enabled.
- Add `GOOGLE_MAPS_API_KEY` to `.env` and to `app.json` under `android.config.googleMaps.apiKey` and `ios.config.googleMapsApiKey`.
- Set `MAPS_PROVIDER=google` in `.env` — this flips `env.useNativeMaps` to `true`, so `MapScreen` renders native `react-native-maps` instead of the `MockMapView` fallback.
- `MapScreen.tsx` uses `react-native-maps` which reads the key from `app.json` automatically. Build a dev client (`npx expo run:android`) — native maps do not render in Expo Go without a key.

---

### 6. EAS build

**Goal:** produce a signed build for TestFlight / Play Store internal testing.

**Steps:**
- Install EAS CLI: `npm install -g eas-cli`.
- Run `eas build:configure` to create `eas.json`.
- Add EAS secrets for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_MAPS_API_KEY`, and the chosen AI provider key.
- Add real icon and splash assets (referenced in `app.json` but currently absent — add 1024x1024 PNG for icon and 1284x2778 PNG for splash).
- Run `eas build --platform ios` and `eas build --platform android`.
- Submit with `eas submit`.

---

### 7. Duplicate detection

**Goal:** penalise repeated sightings of the same species by the same user.

**Approach:**
- Before scoring, query `sightings` for `user_id = auth.uid() AND common_name = <recognized name>`.
- If a match exists, set `ScoreInput.isDuplicate = true`. The scoring engine applies a 70% XP penalty automatically.
- Add a unique index on `(user_id, common_name)` in `schema.sql` if one sighting per species per user is the intended rule, or track counts if multiple sightings are allowed with diminishing returns.

---

### 8. Streak tracking

**Goal:** reward daily capture streaks with an XP bonus.

**Approach:**
- Add a `current_streak` integer column and `last_capture_date` date column to `profiles`.
- After each successful capture, compare today's date to `last_capture_date`:
  - Same day: no change to streak.
  - Previous day: increment `current_streak`.
  - Gap > 1 day: reset `current_streak` to 1.
- Pass `profile.current_streak` as `ScoreInput.streak`. The scoring engine already handles streak multipliers (every 5-day step adds 5%, capped at 25%).

---

### 9. Premium / monetisation (optional)

Possible directions, none yet designed:

- **LifeDex Pro subscription**: unlimited card generation (AI provider costs), no ads, advanced stats.
- **Species packs**: curated regional species_rules sets (e.g. "Alpine Pack", "Tropical Pack") unlocked via IAP.
- **Card trading / gifting**: social layer where users can trade duplicate cards (complex; later milestone).
- **Conservation donations**: opt-in donation flow when photographing a protected species — links to relevant conservation organisations.

No monetisation code exists yet. Implement only after core persistence and auth are stable.

---

### 10. AR camera layer (later)

A future enhancement to overlay species identification hints in real-time via the camera viewfinder, similar to how Pokemon GO shows Pokemon in AR. This requires:
- A streaming or low-latency vision model.
- `expo-camera` or `ViroReact` / `@viro-community/react-viro` for AR overlays.
- Significant battery and performance optimisation.

Do not attempt until the core capture-to-card pipeline is fully production-wired.

---

### 11. World & content layers (post-backend)

Requested product directions. None are built; most depend on the Supabase backend
and/or production maps, so they slot AFTER persistence + auth + real maps. Captured
here so they are not lost.

- **Animals stay the primary focus; flora fills the gap.** Animals remain the
  highest-value, headline catch — but you don't run into a dog/cat/fox every few
  minutes, so plants, trees and mushrooms keep the loop alive between animal finds.
  Keep animals at the top of the `species_rules` rarity/XP scale; give flora solid
  but lower everyday value. A PlantNet-style adapter can back flora recognition for
  the real `VisionRecognitionProvider`. (Pure data/scoring — can start early.)
- **Real green spaces.** With production maps, parks render from the tile layer.
  For richer overlays, ingest OpenStreetMap `landuse=forest` / `leisure=park` /
  `natural=wood` polygons into a `green_zones` table and draw them on the map.
- **Points of interest per city.** New `points_of_interest` table
  (id, name, type, city, location, source). Seed a handful by hand for the MVP;
  pull from OSM / Wikidata for production. Surface as map markers + discovery hints.
- **Habitat zones.** New `habitat_zones` table (area polygon + expected species +
  rarity/XP modifier). Drives hints ("Fox territory nearby", "Known sheep pasture")
  and optionally a spawn/bonus mechanic. Curated content, not user-generated.
- **Shared / community sightings.** A user's catch (e.g. a cow) becomes visible to
  other users on the public map. This is exactly what the Supabase phase delivers:
  `sightings` with PUBLIC, FUZZED coordinates + RLS + a public map query — no new
  architecture. **Hard guardrails (already in the design, keep them):**
  - Public coordinates are always fuzzed; protected/sensitive species stay hidden
    (no public pinpointing of wildlife — poaching / disturbance risk).
  - Public surface shows the AI recreation card, never the original photo.
  - Domestic animals / livestock: do not tie a public pin to a private address or
    property; fuzz and keep generic.
  - Needs moderation + anti-spoof (fake sightings) before it goes public.
