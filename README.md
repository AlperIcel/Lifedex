# LifeDex

A Pokemon-GO-style mobile app for discovering **real** animals, plants, trees, and mushrooms. Photograph a living thing, identify it, earn XP and rarity scores, and collect a trading card — an AI recreation of what you found, not your original photo.

## Core product rules

1. The original photo is **private evidence only** — it is stored encrypted, never shared publicly.
2. The public card is an **AI recreation**. The photo never leaves your device's private storage bucket.
3. Faces, people, license plates, house numbers, and private interiors are **hard-blocked** before anything is stored.
4. Exact GPS is **never public** for sensitive, protected, or rare species (nests, young animals). Coordinates are fuzzed to a grid cell sized by species sensitivity tier.
5. Zoo and captive animals are a separate category with capped XP; they do not appear on wild discovery leaderboards.
6. The app actively **discourages harm**: safety notes on protected species, no approaching nests, no collecting protected plants, no trespassing prompts.

---

## Architecture overview

```
Camera / Gallery
      |
      v
 CaptureScreen
      |  calls createSightingFromImage({imageUri, location})
      v
 sightingPipeline.ts                          <- single orchestration point
      |  moderate -> recognize -> score
      |  -> locationPrivacy -> buildCardMetadata -> cardGen
      |  -> lifeDexStore.addSighting(sighting, card)
      |
      +-- blocked  ->  CaptureScreen shows blocked overlay (nothing stored)
      |
      +-- ok  ->  navigation.navigate('Result', { sightingId })
                        |
                        v
                   ResultScreen                <- READ-ONLY store lookup
                        |  getSightingById(sightingId)
                        |  getCardById('card-' + sightingId)
                        v
                   CollectionScreen / MapScreen / LeaderboardScreen
                        |  all read from useLifeDexStore() (reactive)
```

Every external capability (vision, moderation, card generation, location privacy, scoring) is behind a **typed interface** in `src/providers/interfaces.ts`. Mock implementations in `src/providers/mock/` let the app run with zero API keys in local development.

---

## Folder structure

```
LifeDex/
├── App.tsx                        # Root: NavigationContainer + RootNavigator
├── app.json                       # Expo config; sets AI_PROVIDER=mock, MAPS_PROVIDER=mock
├── babel.config.js                # @/* alias via module-resolver
├── tsconfig.json                  # strict, noUncheckedIndexedAccess, paths: @/* -> src/*
├── jest.config.js                 # moduleNameMapper mirrors tsconfig paths
├── .env.example                   # documented env-var template (no secrets)
|
├── src/
│   ├── domain/                    # Pure business logic -- no React, no network
│   │   ├── types.ts               # SINGLE SOURCE OF TRUTH: all Zod schemas + inferred types
│   │   ├── scoring.ts             # XP + rarity engine (scoreSighting, DefaultRarityScoringProvider)
│   │   ├── locationPrivacy.ts     # GPS fuzzing by sensitivity tier
│   │   ├── moderation.ts          # Blocking rules: faces / plates / quality gate
│   │   └── cardMetadata.ts        # Builds CardMetadata from RecognitionResult + ScoreResult
│   |
│   ├── providers/
│   │   ├── interfaces.ts          # Provider contracts (5 interfaces)
│   │   ├── index.ts               # getProviders() factory -- reads env, returns Providers
│   │   └── mock/                  # Zero-key mock implementations
│   │       ├── mockVision.ts      # Deterministic djb2 hash -> 15-species table
│   │       ├── mockModeration.ts  # URI keyword markers -> DetectorSignals -> decideModeration()
│   │       ├── mockCardGen.ts     # Returns mock-card://<category>/<slug>/<rarity>/<xp>
│   │       └── index.ts           # Re-exports all mock providers
│   |
│   ├── config/
│   │   └── env.ts                 # Zod-validated env loader (process.env + Expo Constants)
│   |
│   ├── theme/
│   │   └── theme.ts               # colors, rarityColors, spacing, radius, typography
│   |
│   ├── navigation/
│   │   ├── types.ts               # RootStackParamList + RootTabParamList
│   │   └── RootNavigator.tsx      # NativeStack + BottomTab; modal screens
│   |
│   ├── screens/
│   │   ├── OnboardingScreen.tsx   # 3-step privacy/ethics primer; replace('Tabs')
│   │   ├── HomeScreen.tsx         # Reads useLifeDexStore(); LevelRing, discovery carousel
│   │   ├── CaptureScreen.tsx      # Calls createSightingFromImage(); navigates with sightingId
│   │   ├── ResultScreen.tsx       # Read-only: getSightingById + getCardById from store
│   │   ├── CollectionScreen.tsx   # Reads store.collectionCards; navigates CardDetail by card.id
│   │   ├── CardDetailScreen.tsx   # Reads store via getCardById + getSightingById
│   │   ├── MapScreen.tsx          # Reads store.sightings (reactive); native maps OR MockMapView fallback
│   │   ├── LeaderboardScreen.tsx  # Reads store.leaderboardEntries + currentUserId
│   │   ├── sightingStore.ts       # Thin shim -> lifeDexStore (keep for legacy imports)
│   │   ├── mock/
│   │   │   └── mockSightings.ts   # Snapshot shim -> lifeDexStore.listSightings()
│   │   └── leaderboard/
│   │       └── mockData.ts        # LeaderboardEntry type + MOCK_LEADERBOARD seed data
│   |
│   ├── services/
│   │   └── sightingPipeline.ts    # createSightingFromImage() -- full pipeline, writes to store
│   |
│   ├── components/
│   │   ├── index.ts               # Barrel export
│   │   ├── CardView.tsx           # Rarity-bordered collectible card with stats
│   │   ├── RarityBadge.tsx        # Rarity pill (sm / md)
│   │   ├── XPRing.tsx             # SVG arc ring, graceful fallback without react-native-svg
│   │   ├── LevelRing.tsx          # Hero-sized profile progress ring
│   │   ├── ScreenContainer.tsx    # SafeAreaView + optional ScrollView wrapper
│   │   ├── MockCardImage.tsx      # Image for https:// URIs; emoji placeholder for mock-card://
│   │   ├── CollectionCardThumbnail.tsx
│   │   ├── FilterChipBar.tsx      # Generic <T extends string> horizontal chip row
│   │   └── CompletionBadge.tsx    # Pokedex-style X/N counter
│   |
│   ├── hooks/
│   │   ├── useMockStore.ts        # Adapter -> useLifeDexStore() selectors; NearbyRareHint kept here
│   │   ├── useMockCollection.ts   # Adapter -> useLifeDexStore().sightings
│   │   └── useSighting.ts         # Adapter -> lifeDexStore.getSightingById(id)
│   |
│   ├── store/
│   │   ├── useLifeDexStore.ts     # CENTRAL STORE: useSyncExternalStore singleton (see below)
│   │   └── useGameStore.ts        # Thin shim -> lifeDexStore (keep for legacy test imports)
│   |
│   └── utils/
│       ├── id.ts                  # newId(prefix) + hashString(s)
│       └── constants/
│           └── species.ts         # TOTAL_SPECIES_COUNT=15 (mirrors supabase/seed.sql)
|
├── supabase/
│   ├── schema.sql                 # Tables, enums, PostGIS columns, triggers, views
│   ├── policies.sql               # RLS: owner-only for private data; public views
│   └── seed.sql                   # 15 species_rules rows (common -> legendary)
|
└── __tests__/
    ├── domain.types.test.ts
    ├── scoring.test.ts
    ├── locationPrivacy.test.ts
    ├── moderation.test.ts
    ├── cardMetadata.test.ts
    ├── captureScreen.pipeline.test.ts
    ├── ResultScreen.test.ts
    ├── cardDetailScreen.test.ts
    └── OnboardingScreen.test.tsx
```

---

## Central store — `useLifeDexStore`

`src/store/useLifeDexStore.ts` is the single runtime source of truth for all app state. It is a `useSyncExternalStore` singleton (no external library).

**What it holds**

| Field | Type | Description |
|---|---|---|
| `profile` | `Profile` | username, xp, level, avatar |
| `sightings` | `Sighting[]` | all captured sightings (seeded + live) |
| `collectionCards` | `CollectionCard[]` | one card per sighting, 1:1 by `card.sightingId` |
| `leaderboardEntries` | `LeaderboardEntry[]` | seeded mock leaderboard |
| `currentUserId` | `string` | `'mock-user-001'` until Auth is wired |
| `pipeline` | `PipelineState` | `{ phase, step?, message?, blocked? }` — live capture progress |
| `loading` | `boolean` | global loading flag |
| `error` | `string \| null` | last error message |

**Key selectors** (pure functions, not hooks)

```typescript
selectRecentDiscoveries(state, limit = 6): Sighting[]  // newest-first slice
selectTodayCount(state): number                          // captures since midnight
selectTotalSpecies(state): number                        // unique commonName count
```

**Key actions**

```typescript
addSighting(sighting, card?): { sightingId, cardId }  // idempotent on id; credits XP to profile
getSightingById(id): Sighting | undefined
getCardById(id): CollectionCard | undefined             // card id = 'card-' + sightingId
listSightings(): Sighting[]
listCollection(): CollectionCard[]
getLeaderboard(): LeaderboardEntry[]
getProfile(): Profile
setPipelineState(p): void
reset(): void  // restores seeded baseline, NOT empty state
```

**Seeding:** at startup the store is populated once from the 15-species `SEED_ENTRIES` table (same data as the old `useMockCollection` species list), each entry run through the real `scoreSighting` + `buildCardMetadata` + `getPublicLocation`. Profile XP is the sum of seed XP. The old scattered `MOCK_SIGHTINGS` / `MOCK_PROFILE` / `MOCK_ENTRIES` constants are no longer authoritative.

**Card id convention:** `'card-' + sighting.id`. `getCardById('card-mock-sighting-0')` returns the card for `getSightingById('mock-sighting-0')`.

---

## Environment variables

All variables are optional in mock mode. The app runs fully offline with no keys when both providers default to `mock`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | Only when not mocking | — | Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Only when not mocking | — | Supabase anon/public key |
| `AI_PROVIDER` | No | `mock` | Vision + moderation + card-gen backend. `mock` = no keys, deterministic. Future values: `google`, `openai`, `replicate`, etc. |
| `MAPS_PROVIDER` | No | `mock` | `mock` = `MockMapView` fallback (stylised surface, no native render, no token — native maps are blank in Expo Go without a key). A real value (e.g. `google`, needs `GOOGLE_MAPS_API_KEY` + dev build) flips `env.useNativeMaps` and renders native `react-native-maps`. |
| `GOOGLE_MAPS_API_KEY` | Only when `MAPS_PROVIDER=google` | — | Google Maps SDK key for Android + iOS |

Variables are read by `src/config/env.ts` from both `process.env` and `expo-constants` (`expoConfig.extra`). Set them in `.env` for local development or in the `extra` block of `app.json` for CI/EAS builds.

Copy `.env.example` to `.env` and fill in values as needed. Never commit `.env`.

---

## Run locally with mock providers (no keys)

```bash
# 1. Install dependencies
npm install

# 2. Start Expo dev server
npm start

# 3. Press i for iOS Simulator, a for Android Emulator, or scan the QR with Expo Go
```

Mock mode is the default. `AI_PROVIDER` and `MAPS_PROVIDER` both default to `mock` in `app.json`, so no `.env` file is needed.

The mock vision provider uses a deterministic djb2 hash of the image URI to select from a 15-species table. To trigger specific moderation outcomes, include keywords in the image filename when using the gallery picker in mock mode (`face`, `person`, `plate`, `blur`, `dark`, `interior`).

---

## Run tests

```bash
# All suites
npm test

# Single suite
npx jest __tests__/scoring.test.ts
npx jest __tests__/moderation.test.ts
npx jest __tests__/locationPrivacy.test.ts
```

Tests use Jest with `moduleNameMapper` so `@/domain/types` resolves without Expo/Metro. No network calls, no API keys, no React Native native modules required.

---

## Supabase setup

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. Enable the **PostGIS** and **pgcrypto** extensions (Dashboard -> Database -> Extensions).
3. Run the SQL files in this order in the SQL editor:
   ```
   supabase/schema.sql    -- tables, enums, triggers, leaderboard view
   supabase/policies.sql  -- RLS policies and storage bucket policies
   supabase/seed.sql      -- 15 starter species_rules rows
   ```
4. Create two storage buckets via the dashboard or the SQL in `policies.sql`:
   - `private-photos` — private, 20 MB per file limit
   - `card-images` — public, 5 MB per file limit
5. Copy your project URL and anon key to `.env`:
   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   ```
6. Set `AI_PROVIDER` to your chosen real provider once adapters are wired (see `NEXT_STEPS.md`).

Storage path convention enforced by RLS: `{bucket}/{user_id}/{sighting_id}/filename`. Policies use `storage.foldername(name)[1] = auth.uid()::text` to enforce owner-scoped access.
