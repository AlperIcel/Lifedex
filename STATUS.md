# LifeDex — Project Status (living document)

> **This is the single source of truth for "where we are."** Read it first when
> resuming, and UPDATE it whenever something meaningful changes. Working dir:
> `C:\Users\Alper\Downloads\LifeDex`.
>
> **Last updated:** 2026-07-05

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
npm test                 # jest — currently 312 passing
npx tsc --noEmit         # type check — clean
npm start                # Expo dev server (press a = Android emulator)
```
Real recognition needs `.env` (gitignored): `AI_PROVIDER=google` +
`GOOGLE_CLOUD_VISION_KEY=…`. Without it the app runs fully in mock mode.
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
| Recognition ENGINE quality | ⚠️ Google Vision is generic ("Bird"/"Flower"); iNaturalist/PlantNet is the right backend |
| Server-side score validation (anti-XP-spoof) | ❌ XP computed client-side |
| EAS build / store / push / monetization | ❌ not built |
| GDPR deletion/export | ⚠️ local + community rows done; Storage files + full flow partial |

**Honest read (dual model review):** clean, well-tested skeleton (~B / 7-10 eng),
but ~35–40% of a shippable v1. The hardest, product-defining parts (accurate ID,
real accounts, scale moderation) remain.

## Recently done (highlights)
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
1. 🔑 **Real recognition engine — iNaturalist (fauna) + PlantNet (flora) adapter.**
   THE biggest lever; makes IDs species-accurate. Needs API key(s) from the owner;
   build it key-ready like the Google provider.
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
- Providers (swap real/mock): `src/providers/` — `interfaces.ts`, `mock/`, `google/`.
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
