# LifeDex — Project Status (living document)

> **This is the single source of truth for "where we are."** Read it first when
> resuming, and UPDATE it whenever something meaningful changes. Working dir:
> `C:\Users\Alper\Downloads\LifeDex`.
>
> **Last updated:** 2026-07-27

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

Stack: Expo RN (SDK 51) + TypeScript strict · Supabase (anon auth, Postgres+RLS,
Storage) · Google Cloud Vision (real recognition + moderation) · mock providers
so it runs with **no keys**.

## How to resume / run / verify
```bash
cd C:\Users\Alper\Downloads\LifeDex
npm install
npm test                 # jest — currently 385 passing
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
| Capture → dedup → card → Collection/Map/Ranks loop | ✅ works |
| Recognition + moderation | ✅ REAL (Google Vision, live-verified) / mock fallback |
| Rarity economy + protected-species hiding | ✅ real (species-rules catalogue wired) |
| Card image | ✅ on-device subject crop (real) · AI restyle = premium stub |
| Local persistence (survives restart) | ✅ AsyncStorage |
| Community feed + leaderboard | ✅ real when Supabase configured; simulated fallback |
| Design (all 8 screens + tab bar) | ✅ Apple-level overhaul (Ionicons, haptics, motion) |
| Settings / privacy / export / delete | ✅ |
| Maps | ⚠️ stylised MockMapView; native gated behind an (unset) key + dev build |
| Real accounts | ❌ anonymous-only (device = identity) |
| Recognition ENGINE quality | ✅ REAL species-accurate adapter built (iNaturalist CV + PlantNet, key-ready, mock/Google fallback); needs owner API token to activate |
| Server-side score validation (anti-XP-spoof) | ❌ XP computed client-side |
| EAS build / store / push / monetization | ❌ not built |
| GDPR deletion/export | ⚠️ local + community rows done; Storage files + full flow partial |

**Honest read (dual model review):** clean, well-tested skeleton (~B / 7-10 eng),
but ~35–40% of a shippable v1. The hardest, product-defining parts (accurate ID,
real accounts, scale moderation) remain.

## Recently done (highlights)
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

## Next up (prioritized — from the dual review)
1. 🔑 **Activate the recognition engine (owner):** set `AI_PROVIDER=inaturalist` +
   `INATURALIST_API_TOKEN` (token from inaturalist.org/users/api_token), optional
   `PLANTNET_API_KEY`. Then live-verify real IDs on real photos and tune the
   confidence thresholds against actual API output. Optional: deploy off-device
   proxies (`INAT_PROXY_URL` / `PLANTNET_PROXY_URL`) like the Vision proxy. Also
   worth verifying at integration: iNat may want the api_token WITHOUT a `Bearer`
   prefix (see comment in `inatClient.ts`).
2. **Server-side score validation** (Supabase Edge Function re-computes XP,
   rejects spoofed inserts) — client-minted XP is currently trust-based.
3. **Dedup retention tuning** — re-catch should grant small XP instead of 0
   (product decision on amounts/gating).
4. **Real accounts** (Sign in with Apple/Google over the anonymous session).
5. **Community moderation ops** (report button + `moderation_status` + review).
6. **EAS build + store prep** (eas.json, icons/splash, privacy policy, GDPR
   server-side deletion of Storage files), retention (push notifications).

## Owner setup (unlocks features; all guarded — app works without them)
See **`docs/OWNER_SETUP.md`**. Summary: run `supabase/storage.sql` (card images
bucket), `supabase/migrations/002_username.sql` (named ranks), deploy
`supabase/functions/vision-proxy` (keep key off-device). Maps need a Google Maps
key + dev build.

## Architecture map (where things live)
- Domain (pure, tested): `src/domain/` — scoring, dedup, moderation, locationPrivacy,
  speciesRules, streak, types (Zod, single source of truth).
- Pipeline (one write-point): `src/services/sightingPipeline.ts`.
- Store (one reactive singleton): `src/store/useLifeDexStore.ts` + `persistence.ts`.
- Providers (swap real/mock): `src/providers/` — `interfaces.ts`, `mock/`, `google/`,
  `inaturalist/` (CV, primary), `plantnet/` (flora refiner). Factory: `index.ts`.
- Backend glue: `src/lib/` — supabase, community, cardImageUpload, leaderboard, onboarding.
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
