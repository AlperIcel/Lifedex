# LifeDex — Project Status (living document)

> **This is the single source of truth for "where we are."** Read it first when
> resuming, and UPDATE it whenever something meaningful changes. Working dir:
> `C:\Users\Alper\Downloads\LifeDex`.
>
> **Last updated:** 2026-07-30

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
npm test                 # jest — currently 684 passing
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
| Solo Lab (research bench for uncatalogued "bonus find" catches) | ✅ done — vials/RP/gadgets/samples (`src/store/lab.ts`), Makro-Linse +15% XP hook in scoring, weekly research focus, ResultScreen bonus-find banner, new `LabScreen`; zero network I/O, community panel is copy-only (v1.1 teaser) |
| Recognition + moderation | ✅ REAL (Google Vision, live-verified) / mock fallback |
| Rarity economy + protected-species hiding | ✅ real AND scalable — curated catalogue → real iNat observation frequency → capped generic fallback |
| Card image | ✅ on-device subject crop (real) · AI restyle = premium stub |
| Local persistence (survives restart) | ✅ AsyncStorage |
| Solo-cut (v1) | ✅ done — Ranks tab replaced by local **Stats & Achievements**; simulated players gone from the tab bar; community push code-gated OFF (`src/config/features.ts`) |
| Community feed + leaderboard | ⏸ built, OFF by default for v1 (single-player); `LeaderboardScreen`/`src/lib/leaderboard.ts` kept for v1.1, just not wired into a tab |
| Design (all 8 screens + tab bar) | ✅ Apple-level overhaul (Ionicons, haptics, motion) |
| Game-feel & retention | ✅ escalated epic/legendary reveal + visible level-up + sound (expo-audio, placeholder WAVs) + daily quests/species-of-the-day + achievement XP rewards + Living-Dex silhouettes + wonder-first onboarding + reduce-motion a11y |
| Localization | ✅ EN/DE — device-default + in-app switch (Settings); `src/i18n/` |
| Settings / privacy / export / delete | ✅ game-style sections + real haptics/units toggles (`store/settings.ts`) |
| Maps | ⚠️ stylised MockMapView; native gated behind an (unset) key + dev build |
| Real accounts | ❌ anonymous-only (device = identity) |
| Recognition ENGINE quality | ✅ REAL + LIVE-VERIFIED on device (iNaturalist CV token active; caught "Nephrolepis exaltata" correctly). PlantNet flora refiner optional. |
| Server-side score validation (anti-XP-spoof) | ❌ XP computed client-side |
| EAS build / store / push / monetization | ❌ not built |
| GDPR deletion/export | ⚠️ local + community rows done; Storage files + full flow partial |

**Honest read (updated 2026-07-29):** the hardest product-defining parts are now
DONE — species-accurate recognition (live-verified), a scalable context-honest
rarity economy, and a genuine game-feel layer (escalated reveal + visible
level-up + sound + daily loop + achievement rewards + wonder onboarding +
Living-Dex + reduce-motion a11y). This is a coherent, well-tested single-player
v1 (~600 tests). What stands between here and a store launch is mostly OWNER /
process work, not core invention: the EAS dev build (queued), field playtesting,
recognition proxies **deployed** (the code — incl. token auto-refresh — is done),
Play closed testing (14-day clock), store assets, and further content scale
(catalogue now 130 curated species). Community/accounts remain cut to v1.1.

## Recently done (highlights)
- **Solo Lab teaser shipped (2026-07-30, senior-review spec).** A single-player
  "field bench" for catches OUTSIDE the curated `speciesRules.ts` catalogue —
  explicitly NOT a fake community (no dead buttons, no fake progress counters,
  no simulated other players). Submitting a sample pays out IMMEDIATELY: a vial
  is consumed, research points are minted, the specimen is filed with its
  global-rarity intel, maybe an achievement unlocks.
  - New pure domain `src/domain/lab.ts`: `GadgetId`/`LabSample` types, one
    `LAB_TUNING` tunable block (mirrors `observationRarity.ts`'s style), and
    `isBonusFind` / `canSubmitSample` / `buildSample` / `rpForCatch` /
    `canBuyGadget` / `weekKeyOf` / `labFocusForWeek` / `qualifiesForMacroLens`
    — all pure, all unit-tested (`__tests__/lab.test.ts`).
  - New shared `src/domain/seededRotation.ts` (`hashString`/`mulberry32`/
    `seededShuffle`) lifted out of `dailyQuests.ts` (which now imports it
    instead of duplicating it) so `lab.ts`'s weekly focus rotation reuses the
    exact same seed→shuffle machinery — `dailyQuests.test.ts` still green
    (behaviour byte-identical).
  - New reactive singleton `src/store/lab.ts` (copies `settings.ts`'s skeleton:
    versioned AsyncStorage key `lifedex:lab:v1`, sanitize guard, single-flight
    `hydrate()`, `flush()`) holding `researchPoints`/`vials`/`ownedGadgets`/
    `samples`. Every action (`submitSample`, `creditCatchRp`, `buyVial`,
    `buyGadget`, `grantDailyVial`) is gated IN THE STORE (same defensive stance
    as `claimDailyReward`), so the invariants hold even if a caller bypasses a
    disabled button. Wired into `persistence.ts`'s `clearUserCaptures()` so
    factory-reset stays complete (key duplicated as a literal, not imported —
    avoids a persistence→lab→useLifeDexStore→persistence import cycle).
  - Scoring gains a Makro-Linse **+15% XP** step (`scoring.ts`, inserted
    between the first-discovery and streak steps so the zoo/domestic caps and
    duplicate floor still apply — a post-score bonus would have bypassed them).
  - `sightingPipeline.ts`: computes `macroLens` (gadget owned AND
    `qualifiesForMacroLens`), credits Lab RP on every non-duplicate catch,
    carries `observationsCount`/`taxonId` onto the persisted `Sighting`, and
    adds `isBonusFind` to its result — moderation/dedup/privacy/
    `features.communitySharing` untouched.
  - Schema (`domain/types.ts`, all optional, old persisted rows still parse):
    `RecognitionResult` gains `iconicTaxon` (spec) **and** `taxonId` (added
    beyond the literal spec text — needed so the pipeline can actually carry
    the iNat taxon id through without touching the raw `InatScoreResponse`;
    populated in `inatMapping.ts`'s `mapInatResponse` from the same accepted
    candidate `topTaxonId` already reads, so the two never disagree);
    `Sighting` gains `observationsCount`+`taxonId`; `ScoreInput` gains
    `macroLens`. One mock species (Peacock Butterfly) tagged
    `iconicTaxon: 'Insecta'` so the Makro-Linse is demonstrable keyless.
  - `ResultScreen.tsx`: one new Reveal group (bonus finds only, between the XP
    banner and safety/description) offering "Send to the Lab" — vial-available/
    already-sampled/no-vials states, "View Lab" link; level-up/achievement
    sequencing untouched.
  - New `src/screens/LabScreen.tsx` (hero RP/vials/level; weekly research
    focus, locked teaser until the Lab Pass gadget; sample bench newest-first
    with real card art + tap→CardDetail; equipment shop with level/price gates;
    a copy-only "coming in v1.1" community panel) registered as a pushed stack
    screen next to SpeciesOfDay. Entry points: the ResultScreen banner + a new
    flask-outline affordance on Home's Today card (which now also grants one
    bonus vial via `grantDailyVial` on a successful daily-reward claim).
  - 3 new achievements (`first-sample`/`field-researcher`/`lab-patron` at 1/5/15
    filed samples) via `computeAchievements`'s optional 3rd `sampleCount` arg
    (defaults to 0 — every other caller unaffected); StatsScreen shows real
    progress (reads `labStore`); LabScreen owns its OWN pending-achievement
    queue + toast (mirrors `useLifeDexStore`'s pattern) so it never competes
    with ResultScreen's level-up/achievement choreography.
  - EN/DE throughout (existing strings byte-stable). Zero network I/O anywhere
    in the feature. +84 tests (600 → 684): new `lab.test.ts`/`labStore.test.ts`,
    plus additions to `scoring.test.ts`, `sightingPipeline.test.ts`,
    `domain.types.test.ts`, `achievements.test.ts`. tsc/jest/`expo export
    --platform android` all green.
- **Species-of-Day always has a photo · collection order · catalogue 47→130 (2026-07-30).**
  - **Reliable Species-of-the-Day media** (`28270b1`): some species (Grass Snake)
    showed no picture — `lore.ts` used only English Wikipedia by exact title. New
    `src/lib/taxonMedia.ts` adds an **iNaturalist taxon photo + summary** (same
    token-free API as rarity; a photo for ~every species) as the guaranteed image;
    Wikipedia lore layered on top for richer text; CC attribution shown.
  - **Collection ordered by most-caught category** (`9f45e66`): not always animals
    first — leads with the category you've caught the most in (ties keep canonical
    order).
  - **Catalogue 47 → 130** (`b5af26e`): +83 common European species (animal 29→60,
    plant 8→30, tree 6→24, mushroom 4→16) with correct binomials, honest rarity,
    conservative sensitivity. Additions only; every original entry untouched. (Real
    catches were never limited to the catalogue — iNat adds hundreds of thousands
    as uncounted "bonus" finds; this just grows the guaranteed checklist.)
- **Capture "where did you find it?" — outdoors vs at home (2026-07-30).** The
  recogniser can't tell a wild plant from a houseplant (defaults to `wild`), so
  the player now chooses at capture: a segmented "Outdoors / At home" toggle above
  the shutter (`91a44a9`). 'Home' resolves the catch to `domestic` via new pure
  `src/domain/accessibility.ts` (`resolveCaptiveStatus` / `isPubliclyReachable`,
  `5820bea`), which drives three things through the existing captiveStatus field:
  the domestic XP/rarity cap (`scoring.ts`), a "not reachable" map marker (dimmed
  pin + home badge, `a481a18`), and privacy — a home find is never shared to the
  community feed/map (its location is the player's home). +9 tests.
- **Daily-loop clarity + collection order + token refresher (2026-07-30).**
  - **Species of the Day is now an info card, not a catch task** (`4b33f98`): the
    row used to open the camera and show only a name — confusing (you can't catch
    a named wild species on demand, e.g. a grass snake in a city, and it gave no
    reward). New `SpeciesOfDayScreen` shows a Wikipedia photo + multi-paragraph
    lore + "read more" + rarity/category, reusing `lib/lore.ts`. `speciesOfTheDay`
    now also returns rarity+category; Home shows a thumbnail + "tap for info".
  - **"Catch something wild" subtitle** "Not a pet or zoo animal" (de "Kein Haus-
    oder Zootier") so the quest is unambiguous.
  - **Collection shows discoveries first** (`3b78515`): real (uncatalogued "bonus")
    catches used to sit BELOW every grey locked silhouette — so an actual find
    (the Boston fern) was buried at the bottom. Each category now lists caught
    tiles first (newest on top), locked silhouettes below. Counts/completion
    unchanged, order only.
  - **Capture-result status pill de-paw'd** (`dc1c87b`): the Wild/Domestic/Zoo pill
    was hardcoded to an animal paw, so a plant got a paw. Icon now reflects the
    STATUS (wild = trail-sign, domestic = home, zoo = building).
  - **Local iNat token refresher** (`e4218c2`, `c6a2186`): `npm run inat:token`
    mints a fresh 24h JWT from a stable credential and writes it into `.env` — no
    more daily hand-copy. Uses a browser **session cookie** (no OAuth app needed,
    since iNat gates app creation) or an OAuth access token / password grant.
    Owner-side twin of the inat-proxy auto-refresh.
- **Token expiry killed + tree/plant split + camera & a11y polish (2026-07-29).**
  - **iNat proxy auto-refreshes its own 24h JWT** (`supabase/functions/inat-proxy`):
    the ~24h personal `api_token` used to force a daily manual swap in `.env`. The
    proxy now mints + caches the JWT server-side from a stable OAuth credential
    (`INAT_OAUTH_ACCESS_TOKEN`, or a password grant) and refreshes it ~1 h before
    expiry, with a single-flight mint guard and one 401-retry. The app never holds
    a token again; the old `INATURALIST_API_TOKEN` still works as a legacy
    no-refresh fallback. Owner action shrinks to one secret + deploy
    (`docs/OWNER_SETUP.md` §4). Deno file (outside tsc/jest); app code unchanged.
  - **Trees told apart from herbaceous plants by taxonomic family** (`8bb5e53`):
    iNat's iconic taxa have no "tree" bucket, so a `plant` result is reclassified
    to `tree` when the SAME best-effort `/v1/taxa` lookup resolves its family to a
    known tree family (`src/domain/treeFamilies.ts`, precision-first 16-family set;
    Rosaceae/Malvaceae deliberately excluded to avoid mislabelling shrubs/berries).
    Reuses the rarity lookup — no extra request. Collection's category
    sort/sections now genuinely separate trees from plants.
  - **Full-screen camera** (`2738e8d`): tab bar hidden in capture mode; a
    WhatsApp-style close (X) button + LIVE badge to leave photo mode, so the round
    shutter no longer collides with the tab bar.
  - **Reduce-motion honoured in the XP/level rings** (`LevelRing`/`XPRing`): the
    arc-fill sweep snaps straight to its final value when the OS "reduce motion"
    setting is on — the last animation that was still ignoring the a11y flag.
- **Overnight game-feel + retention wave (2026-07-29, studio plan + audit).** On
  top of the rarity economy below: quick-wins (NEW-species badge, tier reveal
  copy, rarity card-back glow, Home streak flame, map Ionicons, 44pt targets);
  **The Juice** (visible level-up takeover + escalated epic/legendary reveal with
  sunburst/particles/stamp); **sound system** (expo-audio, silent placeholder
  WAVs, real Settings toggle); **daily loop** (`src/domain/dailyQuests.ts`, Home
  Today card, claimable reward); **wonder-first onboarding** (example card, not 9
  rules); **Living-Dex** collection (category sections + silhouette gaps,
  `src/domain/dexGrouping.ts`; fixed a latent >100% completion bug). Plus two
  verified audit bugs (map→CardDetail id; `isFirstDiscovery` made real). All green.
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
   proxies so no token ships in the client — DONE in code, and the iNat proxy now
   **auto-refreshes its own 24h JWT** (deploy + one OAuth secret is the only owner
   step left; `docs/OWNER_SETUP.md` §4). Still to add: a per-user daily cap at the
   proxy (= cost control + anti-abuse + monetization lever).
5. **Monetization:** free + generous daily cap + one-time **"Pro"** unlock
   (higher/unlimited cap + cosmetics). Subscription deferred to v1.1.
6. **Store prep:** icons/splash final, hosted privacy policy, Play Data Safety,
   screenshots EN/DE, GDPR local wipe, Sentry. **Start Play Closed Testing EARLY
   — 12 testers × 14 days is the longest pole to Production.**

### Cut to v1.1+ (do NOT ship community without both server-XP-validation AND a moderation queue)
Community feed · shared map · real accounts (Apple/Google) · server-side score
validation · report button + `moderation_status` review · push · AI card restyle.

### Smaller follow-ups
- **Solo Lab next steps:** `LAB_TUNING` (vial price, RP-per-rarity, gadget
  price/level) is un-playtested — tune after real play, same stance as the
  rarity curve. Section 4.6 (lab achievements) shipped; if the Solo Lab needs
  scope-cutting later, that's the first thing to trim. The community panel is
  copy-only by design — wire real cross-player sample verification only
  alongside the v1.1 community launch (same gate as everything else in "Cut to
  v1.1+" below).
- **Region-aware targeting (DESIGN PRINCIPLE — owner note 2026-07-30):** any task
  that names a SPECIFIC species (Species-of-the-Day, future species-targeted
  quests/lures) MUST be regionally plausible — never ask for a species that
  doesn't occur in the player's country. Source: iNaturalist's regional
  observation data (`/v1/observations/species_counts` by coarse location — the
  same token-free API family as rarity), keyed on the fuzzed capture GPS or the
  device region as a fallback. Effort tiering: MUST-HAVE tasks (daily quests,
  Lab weekly focus, Species-of-Day) stay near / short-trip and are ALREADY safe
  because they are CATEGORY-based ("catch a mushroom", not "find species X");
  only BONUS/special targets may sit a ½–1 h drive away with bigger rewards, and
  are never marked mandatory. Build the regional species picker when
  species-specific targeting lands (Species-of-Day tuning first, then lures); it
  also underpins international catalogue scaling (the 130 curated species are
  currently Europe/DE-centric).
- ✅ **Capture accessibility toggle DONE (2026-07-30):** the outdoors/at-home
  choice drives captiveStatus (domestic rarity/XP cap), the map "not reachable"
  marker, and privacy (home finds never shared). Still pending: the REAL map
  (parks/lakes) needs a Google Maps key + dev build (owner) — the code path is
  ready (`env.useNativeMaps`), the stylised MockMapView is the keyless fallback.
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
  onboarding, lore (Wikipedia), taxonMedia (iNat photo+summary), inatObservations (rarity signal).
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
