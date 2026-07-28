# LifeDex — Project Status (living document)

> **This is the single source of truth for "where we are."** Read it first when
> resuming, and UPDATE it whenever something meaningful changes. Working dir:
> `C:\Users\Alper\Downloads\LifeDex`.
>
> **Last updated:** 2026-07-28

---

## What LifeDex is
A Pokémon-GO-style mobile app for discovering **real** animals, plants, trees and
mushrooms. Take a **live** photo → AI identifies the species → rarity + XP (rarer
= more; a rare orchid beats the neighbour's dog) → a collectible **card** → a
privacy-**fuzzed** map → a community feed. Ethos: **"discover, don't disturb."**
Privacy-first is the brand: original photo stays private (only a processed
subject-crop card is public), exact GPS never public (protected species hidden),
zoo/captive capped. Animals are the headline catch; plants/trees/mushrooms fill
the everyday gap. Later: premium (AI card restyle, more captures), real map layers.

Stack: Expo RN (SDK 54, RN 0.81, React 19) + TypeScript strict · Supabase (anon auth, Postgres+RLS,
Storage) · Google Cloud Vision (real recognition + moderation) · mock providers
so it runs with **no keys**.

## How to resume / run / verify
```bash
cd C:\Users\Alper\Downloads\LifeDex
npm install
npm test                 # jest — currently 501 passing
npx tsc --noEmit         # type check — clean
npm start                # Expo dev server (press a = Android emulator)
```
Real recognition needs `.env` (gitignored). Best: `AI_PROVIDER=inaturalist` +
`INATURALIST_API_TOKEN=…` (+ optional `PLANTNET_API_KEY=…`) for species-accurate
IDs. Alt: `AI_PROVIDER=google` + `GOOGLE_CLOUD_VISION_KEY=…` (generic labels).
Without any of it the app runs fully in mock mode.
Every change must keep **tsc + jest + `npx expo export` (bundle)** green.

## Current state at a glance
| Area | State |
|---|---|
| Capture → dedup → card → Collection/Map/Stats loop | ✅ works |
| Recognition + moderation | ✅ REAL (Google Vision, live-verified) / mock fallback |
| Rarity economy + protected-species hiding | ✅ real AND scalable — curated catalogue → real iNat observation frequency → capped generic fallback |
| Card image | ✅ on-device subject crop (real) · AI restyle = premium stub |
| Local persistence (survives restart) | ✅ AsyncStorage |
| Solo-cut (v1) | ✅ done — Ranks tab replaced by local **Stats & Achievements**; simulated players gone from the tab bar; community push code-gated OFF (`src/config/features.ts`) |
| Community feed + leaderboard | ⏸ built, OFF by default for v1 (single-player); `LeaderboardScreen`/`src/lib/leaderboard.ts` kept for v1.1, just not wired into a tab |
| Design (all 8 screens + tab bar) | ✅ Apple-level overhaul (Ionicons, haptics, motion) |
| Localization | ✅ EN/DE — device-default + in-app switch (Settings); `src/i18n/` |
| Settings / privacy / export / delete | ✅ game-style sections + real haptics/units toggles (`store/settings.ts`) |
| Maps | ⚠️ stylised MockMapView; native gated behind an (unset) key + dev build |
| Real accounts | ❌ anonymous-only (device = identity) |
| Recognition ENGINE quality | ✅ REAL + LIVE-VERIFIED on device (iNaturalist CV token active; caught "Nephrolepis exaltata" correctly). PlantNet flora refiner optional. |
| Server-side score validation (anti-XP-spoof) | ❌ XP computed client-side |
| EAS build / store / push / monetization | ❌ not built |
| GDPR deletion/export | ⚠️ local + community rows done; Storage files + full flow partial |

**Honest read (dual model review):** clean, well-tested skeleton (~B / 7-10 eng),
but ~35–40% of a shippable v1. The hardest, product-defining parts (accurate ID,
real accounts, scale moderation) remain.

## Recently done (highlights)
- **Scalable, context-honest rarity economy (2026-07-28, studio-review priority #1).**
  Rarity was context-free: only the ~48 curated species in `speciesRules.ts` had a
  real `baseRarity`; everything else — ~99 % of what iNat actually recognises —
  fell to the generic fallback in `scoring.ts`, which **caps at `rare`**. Epic and
  legendary were therefore unreachable for real catches and the reveal never
  surprised. Fixed by using **real observation frequency** as the rarity signal:
  iNaturalist publishes a GLOBAL `observations_count` per taxon on a public,
  token-free endpoint (`GET /v1/taxa/{id}`). Many observations = everyday; few =
  legendary. Honest, scales to every species, reuses the source already wired.
  - New pure domain module `src/domain/observationRarity.ts` —
    `rarityFromObservations(count)` with named, tunable thresholds:
    **≥500 k → common · 100 k–500 k → uncommon · 20 k–100 k → rare · 2 k–20 k →
    epic · <2 k → legendary.**
  - New `src/lib/inatObservations.ts` — `fetchObservationsCount(taxonId)`, cached
    (memory + AsyncStorage, `lore.ts` pattern) with a **30-day TTL** so counts
    aren't frozen, a 6 s timeout, and best-effort semantics (never throws, never
    blocks a catch). Transport failures are deliberately NOT cached.
  - `RecognitionResult` gains optional `observationsCount`. The iNat mapper reads
    an embedded `taxon.observations_count` for free and exposes `topTaxonId()`;
    the provider fetches the count only when needed — and only when the final pick
    is still iNat's own taxon (a PlantNet override gets no borrowed count).
  - **Resolution priority** (in both `rarityForRecognition` and the engine, via the
    same pure function): (a) curated catalogue, authoritative → (b) observation
    count → (c) generic category guess. The `rare` cap now bites **only** in (c).
    Quality gate, zoo/captive cap and duplicate penalty are untouched.
  - Mock mode carries plausible real-world counts and gained 5 deliberately
    **uncurated** species (Ghost Orchid → legendary, Alpine Salamander & Bleeding
    Tooth Fungus → epic, Common Wall Lizard → rare, Wood Anemone → uncommon) so a
    keyless run actually shows the full rarity range.
  - Privacy: the taxa call sends **only a numeric taxon id** — no photo, no path,
    no GPS, no user data, no auth header (regression-tested). +63 tests (438 → 501).
- **Build-queue batch (2026-07-28, while the first EAS build queued):** pushed all
  commits to GitHub (`AlperIcel/Lifedex`); wrote the **recognition proxies**
  (`supabase/functions/inat-proxy` + `plantnet-proxy`, Deno — token-off-device,
  JWT-gated, rate-limit TODO; deploy steps in `docs/OWNER_SETUP.md`); improved the
  **native map** path (centre-on-user + recenter FAB, privacy markers intact —
  code only, visible in a dev build + Maps key); drafted **store docs**
  (`docs/PRIVACY_POLICY.md` EN/DE grounded in real behaviour, `docs/STORE_LISTING.md`).
  Note: the first dev build was stuck in the EAS **free-tier queue** for ~1 h —
  a dev build only bundles the native shell, so all JS since (`Phase 2`, km/mi,
  i18n) loads live from Metro; no rebuild needed for those.
- **Solo-cut (release-plan step 2, 2026-07-28): Ranks tab → local Stats & Achievements.**
  Leaderboard tab replaced by a fully local `StatsScreen` (profile hero with
  LevelRing, overview tiles, category/rarity breakdown, achievements grid) — no
  network, no simulated players. Two new pure domain modules: `src/domain/stats.ts`
  (`computeStats`: totals + byCategory + byRarity) and `src/domain/achievements.ts`
  (`computeAchievements`: stable ~12-entry catalogue — first-find, finds-25,
  species-10/25/50, all-categories, first-rare/epic/legendary, streak-7, today-3,
  wild-explorer — ids/progress/icon only, zero display strings, so the domain
  layer stays string-free and trivially unit-tested). `LeaderboardScreen.tsx` and
  `src/lib/leaderboard.ts` are untouched and still work, just no longer wired into
  a tab (kept for v1.1). New `src/config/features.ts` (`communitySharing: false`)
  gates the `pushSighting()` call in `sightingPipeline.ts` off for v1 — capturing
  a sighting no longer touches the network even if Supabase is configured.
  `RootTabParamList` keeps `Leaderboard` alongside the new `Stats` route for a
  clean v1.1 re-enable. +48 tests (385 → 433).
- **Release plan decided (dual-model review, 2026-07-28): v1 = SINGLE-PLAYER.**
  Community/Ranks/accounts are deliberately cut to v1.1 — this removes the three
  biggest liabilities at once (UGC moderation, XP cheating, location-based
  poaching) and makes the privacy story airtight. See "Release plan" below.
- **Dev Build prepped** (the gate that unblocks real map, immersive nav bar,
  accounts, push, store distribution): `eas.json` (development/preview/production
  profiles), Google-Maps-key plumbing in `app.config.js` + `.env.example`, and a
  step-by-step owner guide `docs/DEV_BUILD.md`. Awaiting owner accounts (Expo,
  Google Play $25, Maps key) to run the first `eas build`.
- **Multi-language (EN/DE)** — lightweight i18n engine (`src/i18n/`): reactive,
  persisted language store, co-located `useT(catalog)` per screen + shared
  `useCommon()` enum labels (rarity/category/captive). Auto-default from the
  DEVICE LOCALE (German/DACH device → German, else English) — deliberately NOT
  IP-geolocation, to honour the privacy stance. Switchable anytime in Settings
  (Language section). All 8 screens + tab bar + RarityBadge translated; English
  kept byte-identical so tests pass. Built by 5 parallel screen agents + engine;
  reconciled after concurrent-edit churn. +7 tests (398 → 405).
- **On-device test sprint (real Android via Expo Go)** — batch of end-user fixes:
  - **Discovery-hunt de-dup:** same species is now catchable again only >~1 km
    away (`NEARBY_METERS`); within 1 km → blocked with an "already found nearby,
    keep exploring" message. Zoo/same-spot farming yields one catch. Time no
    longer matters (was 500 m + same-day). `dedup.ts` reworked, pipeline +
    Capture overlay updated, tests rewritten.
  - **Recent-discoveries thumbnail** now shows the real captured crop (was a
    generic category icon); the crop is copied to the document dir so it survives
    restarts (`cropCardGen.ts`).
  - **Species lore** (`src/lib/lore.ts`): best-effort Wikipedia REST summary per
    species (no key, cached, offline-safe), shown in CardDetail "About" with a
    Read-more link; generated blurb is the fallback.
  - **Back button** on CardDetail is now a high-contrast dark disc (was a near-
    invisible translucent glass circle).
  - **Leaderboard honesty:** explicit "example players — not real people" banner
    when the ranking is simulated (no backend).
  - **Settings** rewritten into end-user game sections (Profile, Gameplay,
    Notifications, Privacy & Data, Info) with a real Haptics toggle + km/mi units
    (`src/store/settings.ts`); dev-only provider diagnostics behind `__DEV__`.
- **Recognition live-verified** on a real Android device via Expo Go (iNaturalist
  token in `.env` → `expo.extra`; correctly IDed a Boston fern with real XP/rarity).
- **Immersive Android UI:** hide the system navigation bar (`expo-navigation-bar`,
  `overlay-swipe`) in `App.tsx` so the Samsung gesture bar doesn't overlay chrome.
- **Supabase left OFF by default:** the community layer's background auth refresh
  surfaced a dev-only "Network request failed" overlay when Supabase creds were
  invalid/unreachable. Community is optional; `.env` Supabase vars are commented
  out (app runs fully local). Re-enable with a real anon key + the SQL in
  `docs/OWNER_SETUP.md` when the shared feed/map/leaderboard is wanted.
- **SDK 51 → 54 upgrade** (RN 0.74→0.81, React 18→19) so the current Expo Go can
  run the app. Fixes: `expo-file-system` v19 API moved → import from
  `expo-file-system/legacy` in `visionClient.ts`; reinstalled pruned deps
  (`expo-constants`, `babel-preset-expo`, `expo-font`); `react-test-renderer`→19
  + `@testing-library/react-native`→13 for React 19. All green.
- **Config fix:** `app.config.js` now routes the new recognition secrets
  (`INATURALIST_API_TOKEN`, `PLANTNET_API_KEY`, proxies) into `expo.extra` — non-
  EXPO_PUBLIC vars aren't bundled, so without this the token never reached the app
  and recognition silently fell back to mock. Verified the token lands in the
  resolved config.
- **Species-accurate recognition adapter** (biggest lever, priority #1): iNaturalist
  Computer Vision (fauna/fungi) + PlantNet (flora refiner), env-gated behind
  `AI_PROVIDER=inaturalist`, key-ready like the Google provider — falls back to
  mock (no keys) / Google. Composite picks the more-confident of iNat vs PlantNet
  for flora. `src/providers/inaturalist/` + `src/providers/plantnet/`, wired in
  `providers/index.ts`, env in `config/env.ts` + `.env.example`. Privacy invariant
  enforced + regression-tested: the CV calls send the photo ONLY — never lat/lng.
  Built by an Opus 5 + Fable 5 pair on disjoint files, then adversarial cross-review
  (each model reviewed the other's adapter) — fixed a shared NaN-score bug that
  bypassed the confidence gate, nested-field TypeError guards, rank-set
  inconsistency, and a blind-fallback that would mislabel an animal as a plant.
  +73 tests (312 → 385).
- Full **Apple-level design overhaul** (theme v2, Ionicons, haptics, motion, all 8
  screens + tab bar, Settings, empty/loading states).
- **Real Google Vision** recognition + moderation (one shared API call/photo).
- **species-rules catalogue** wired → real rarity economy + protected-species
  hiding (`src/domain/speciesRules.ts`).
- **Community layer** (anon auth, RLS, shared sightings), **card-image upload**,
  **species de-dup**, **daily streak**, **anti-spoof**, **Vision key-proxy** (code),
  honest privacy docs.
- Two correctness-review passes fixed real bugs (Home card-tap id, leaderboard
  identity, protected-coord leak, crop overflow, etc.).

## Release plan (v1 = SINGLE-PLAYER; decided 2026-07-28, dual-model review)
Recognition is real + live-verified, so the hard part is done. **v1 is a polished
single-player nature-hunt; community/ranks/accounts are cut to v1.1** — this
removes the three biggest liabilities (UGC moderation, XP cheating, location-based
poaching) and makes the privacy story airtight ("nothing is published").

Ordered path to an Android launch:
1. ▶ **Development Build — THE gate (current step; needs owner).** `eas.json` +
   `docs/DEV_BUILD.md` ready. Owner creates Expo + Google Play ($25) accounts,
   runs `eas build --profile development --platform android`. Unblocks everything
   below (real map, immersive nav bar, accounts, push, store, real-device QA).
2. ✅ **Solo-cut (code) — DONE.** Leaderboard tab → local **Stats/Achievements**
   screen; community push behind an off flag for v1; simulated players dropped
   from the tab bar.
3. **Real zoomable map** (react-native-maps + Google Maps key) with the same
   privacy markers (protected = circle only). Needs the dev build.
4. **Key hardening (MANDATORY before any public build):** iNat/PlantNet server
   proxies so the personal 24h token never ships in the client; per-user daily
   cap at the proxy (= cost control + anti-abuse + monetization lever).
5. **Monetization:** free + generous daily cap + one-time **"Pro"** unlock
   (higher/unlimited cap + cosmetics). Subscription deferred to v1.1.
6. **Store prep:** icons/splash final, hosted privacy policy, Play Data Safety,
   screenshots EN/DE, GDPR local wipe, Sentry. **Start Play Closed Testing EARLY
   — 12 testers × 14 days is the longest pole to Production.**

### Cut to v1.1+ (do NOT ship community without both server-XP-validation AND a moderation queue)
Community feed · shared map · real accounts (Apple/Google) · server-side score
validation · report button + `moderation_status` review · push · AI card restyle.

### Smaller follow-ups
- ✅ **km/mi done:** `formatDistance` (`store/settings.ts`) is now read by CardDetail
  (precision/radius), Home ("X away"), and Result (fuzzed-location note) — the
  units toggle in Settings updates them live. (Map circle stays geometric.)
- iNat `Bearer` prefix: verify at integration (comment in `inatClient.ts`).
- **Tune the rarity curve after real play** — thresholds live in one place
  (`OBSERVATION_RARITY_THRESHOLDS` in `src/domain/observationRarity.ts`). Only
  live-verifiable items: whether `score_image` already embeds
  `taxon.observations_count` (if it does, the extra request never fires), and the
  real-world tier distribution of a typical walk.

## Owner setup (unlocks features; all guarded — app works without them)
See **`docs/OWNER_SETUP.md`**. Summary: run `supabase/storage.sql` (card images
bucket), `supabase/migrations/002_username.sql` (named ranks), deploy
`supabase/functions/vision-proxy` (keep key off-device). Maps need a Google Maps
key + dev build.

## Architecture map (where things live)
- Domain (pure, tested): `src/domain/` — scoring, dedup, moderation, locationPrivacy,
  speciesRules, observationRarity, streak, stats, achievements, types (Zod, single
  source of truth).
- Config flags: `src/config/features.ts` (`communitySharing`, off for v1) +
  `src/config/env.ts` (provider/env validation).
- Pipeline (one write-point): `src/services/sightingPipeline.ts`.
- Store (one reactive singleton): `src/store/useLifeDexStore.ts` + `persistence.ts`.
- Providers (swap real/mock): `src/providers/` — `interfaces.ts`, `mock/`, `google/`,
  `inaturalist/` (CV, primary), `plantnet/` (flora refiner). Factory: `index.ts`.
- Backend glue: `src/lib/` — supabase, community, cardImageUpload, leaderboard,
  onboarding, lore (Wikipedia), inatObservations (rarity signal).
- UI: `src/screens/`, shared `src/components/`, `src/theme/theme.ts`, `src/navigation/`.
- Backend SQL/functions/docs: `supabase/`, `docs/`.

## Working conventions (for any agent)
- Verify EVERY change with `tsc --noEmit` + `jest` + a bundle export; commit per
  logical unit with a clear message.
- Tokens only (no raw hex outside `theme.ts`); Ionicons in chrome (emoji only
  inside mock card placeholders); RN `Animated` + `useNativeDriver` (no reanimated).
- Privacy invariants: never render `privatePhotoUri`; never upload the full
  original photo, a `file://` path, or exact GPS; protected species stay hidden.
- **Keep THIS file current** — update the tables + "last updated" when state changes.
