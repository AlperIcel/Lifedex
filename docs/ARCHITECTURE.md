# Architecture

This document describes the structural decisions behind LifeDex: how providers are abstracted, how the capture pipeline flows from photo to card, how scoring and privacy engines work, and what risks exist.

---

## Provider-interface design

Every external capability is hidden behind a typed interface in `src/providers/interfaces.ts`. There are five providers:

```typescript
VisionRecognitionProvider   // identifies species in a photo
ImageModerationProvider     // blocks/flags unsafe content
CardImageGenerationProvider // produces the public AI card image
LocationPrivacyProvider     // fuzzes a GeoPoint to a PublicLocation
RarityScoringProvider       // computes XP + rarity from scored inputs
```

None of these interfaces are coupled to a specific vendor, SDK, or network library. A provider is just an object that implements the interface. The factory function `getProviders()` in `src/providers/index.ts` reads `env.aiProvider` and returns the appropriate concrete implementations:

```
env.aiProvider === 'mock'   -> MockVisionProvider, MockModerationProvider, MockCardGenProvider
env.aiProvider === 'google' -> (to be implemented) GoogleVisionProvider, ...
```

`LocationPrivacyProvider` and `RarityScoringProvider` always use the domain implementations (`DefaultLocationPrivacyProvider`, `DefaultRarityScoringProvider`) because their logic is purely algorithmic — no external API is involved.

This design means:
- The app runs fully offline in mock mode with no API keys or network.
- Swapping vision providers requires writing one new file and changing one env var.
- Domain logic (scoring, location fuzzing, moderation decisions) is tested independently of any provider implementation.
- Provider tests (when written) test only the mapping from vendor response format to the domain interface — not the domain rules themselves.

---

## Data flow: capture to card

The full pipeline is encapsulated in `src/services/sightingPipeline.ts` (`createSightingFromImage`). `CaptureScreen` calls it as a black box and navigates on result.

```
CaptureScreen
  acquires GPS (best-effort, falls back to {lat:0,lng:0})
  calls createSightingFromImage({ imageUri, location })
         |
         v
  sightingPipeline.createSightingFromImage
    1. moderate(imageUri)
       |
       +-- allowed=false  ->  return { ok:false, blocked:true, reasons }
       |                       CaptureScreen shows blocked overlay; nothing stored
       |
       +-- allowed=true   ->  continue

    2. recognize(imageUri)
       -> RecognitionResult { category, commonName, scientificName?,
                              confidence, captiveStatus, sensitivity }

    3. locationPrivacy.getPublicLocation(geoPoint, recognition.sensitivity)
       -> PublicLocation { lat, lng, precisionMeters, hidden }
       NOTE: raw GeoPoint is discarded here, never stored

    4. rarityScoring.score(scoreInput)
       -> ScoreResult { xp, rarity, reason }

    5. buildCardMetadata(recognition, scoreResult)
       -> CardMetadata { name, category, rarity, xp, description, stats, safetyNotes? }

    6. cardGen.generateCard(cardMetadata, recognition)
       -> { publicImageUri }   (AI recreation; never the original photo)

    7. Assemble Sighting + CollectionCard
       Sighting {
         id, userId, createdAt,
         privatePhotoUri: imageUri,   // PRIVATE
         publicImageUri,
         publicLocation,
         card: cardMetadata,
         moderation, ...recognition, ...scoreResult
       }
       CollectionCard { id: 'card-'+sighting.id, sightingId, card, publicImageUri, rarity, createdAt }

    8. lifeDexStore.addSighting(sighting, card)
       -> credits XP to profile, idempotent on sighting.id
       -> return { ok:true, blocked:false, sightingId, cardId }
         |
         v
  navigation.navigate('Result', { sightingId })

ResultScreen  (READ-ONLY — no pipeline re-run)
  getSightingById(sightingId)  -> Sighting
  getCardById('card-' + sightingId)  -> CollectionCard | undefined
  renders flip-card, XP count-up, shimmer — all from already-persisted store data
```

Key invariants enforced by the pipeline structure:
- The raw `GeoPoint` is never written anywhere. Only the fuzzed `PublicLocation` is stored.
- `privatePhotoUri` enters the `Sighting` object but is never passed to `cardGen` or any subsequent provider.
- Moderation runs first. A hard-blocked photo never reaches the vision API, preventing unnecessary API cost and ensuring no rejected content is processed further.
- `ResultScreen` is stateless: it reads the store synchronously. There is no second pipeline run on navigation.

---

## Scoring engine

`src/domain/scoring.ts` — `scoreSighting(input: ScoreInput, baseRarity?: Rarity): ScoreResult`

The engine is a pure function: same input always produces the same XP and rarity. There are no random elements, no database reads, no side effects.

### Rarity derivation

If `baseRarity` is supplied (from a `SpeciesRule` database lookup), it is used directly. Otherwise the engine derives a default from `recognition.category` and `confidence`:

```
animal / mushroom  ->  uncommon  (+ one tier if confidence >= 0.85, max rare)
plant / tree       ->  common    (+ one tier if confidence >= 0.85, max rare)
unknown            ->  common
```

The `+ one tier` bump has a hard ceiling at `rare` to prevent a high-confidence unknown species from being incorrectly scored as `epic` or `legendary`.

### XP rule application order

```
base XP (by rarity tier)
  x confidence multiplier   (conf * 0.5 + 0.5, range 0.5x - 1.0x)
  x category multiplier     (mushroom 1.2x, animal 1.1x, else 1.0x)
  x sensitivity multiplier  (protected 1.4x, sensitive 1.2x, else 1.0x)
  x first-discovery bonus   (x1.5 if isFirstDiscovery)
  x streak multiplier       (floor(streak/5) * 5%, cap 25%)
  -> quality gate           (x0.5 + rarity downgrade if !qualityOk)
  -> captive cap            (zoo_captive: max 15 XP + force common; domestic: max 25 XP)
  -> duplicate penalty      (x0.3, floor at 1 XP, if isDuplicate)
  -> round to integer
```

Base XP by tier: common=10, uncommon=30, rare=80, epic=200, legendary=500.

The quality gate and captive caps are applied after all multipliers so they are not themselves multiplied. The duplicate penalty is always last so it reduces the already-capped or already-penalised result.

---

## Location privacy engine

`src/domain/locationPrivacy.ts` — `getPublicLocation(p: GeoPoint, s: SensitivityLevel): PublicLocation`

GPS coordinates are fuzzed by snapping the true coordinate to the nearest node on a regular grid whose cell dimensions correspond to `precisionMeters` on the ground.

```
precisionMeters = PRECISION_METERS[sensitivity]
  none      ->  175 m
  low       ->  500 m
  sensitive ->  2000 m
  protected ->  10000 m + hidden = true

latStep  = precisionMeters / 111320                          (metres per degree lat, constant)
lngStep  = precisionMeters / (111320 * cos(lat * pi/180))   (varies with latitude)

snappedLat = round(lat / latStep) * latStep
snappedLng = round(lng / lngStep) * lngStep
```

Properties:
- **Idempotent**: snapping an already-snapped coordinate produces the same result.
- **Stable**: the grid is absolute (not relative to the user), so two observers photographing the same protected species from slightly different positions get the same snapped coordinate.
- **Hidden flag**: `protected` sensitivity always sets `hidden=true`. UI layers must check this flag and suppress coordinate display.

---

## Moderation decision logic

`src/domain/moderation.ts` — `decideModeration(signals: DetectorSignals): ModerationResult`

The domain function is called by `MockModerationProvider` (and will be called by real provider adapters). It does no I/O — it only maps detector signals to a decision.

Hard blocks stop the pipeline entirely (`allowed = false`):
- Face detected — privacy
- Person without face detected — privacy
- License plate — PII
- Quality score < 0.4 — photo unusable

Soft flags allow the pipeline to continue but record the issue:
- House number — flagged for stripping
- Private interior — noted in reasons

The real moderation adapter's job is only to map vendor API responses (e.g. Google Vision SafeSearch annotations, face detection polygons) to `DetectorSignals`. All decision logic stays in the domain function.

---

## Domain layer isolation

All files in `src/domain/` have zero dependencies on React, React Native, Expo, or any network library. They import only from each other and from `zod`.

This means:
- Domain logic is testable with plain `jest` — no Expo jest preset, no native module mocks.
- Domain functions can be extracted to a shared library or run server-side without modification.
- TypeScript strict mode + `noUncheckedIndexedAccess` is enforced throughout; all array/record accesses use nullish fallbacks.

---

## State management

The app uses no external state management library.

**`useLifeDexStore` / `lifeDexStore` singleton** (`src/store/useLifeDexStore.ts`) — the central store:
- `useSyncExternalStore` (React 18 built-in) backs the React hook; all screens that call `useLifeDexStore()` re-render reactively on any `addSighting` or `reset`.
- Holds: `profile`, `sightings`, `collectionCards`, `leaderboardEntries`, `currentUserId`, `pipeline`, `loading`, `error`.
- Seeded at module load from the 15-entry species table; `reset()` restores the seed baseline.
- `addSighting(sighting, card?)` is idempotent on `sighting.id` and credits XP to `profile`.
- Three pure selector functions (`selectRecentDiscoveries`, `selectTodayCount`, `selectTotalSpecies`) are used by `HomeScreen` via `useMemo`.
- Level formula: `floor(sqrt(xp / 100)) + 1` (stored on `Profile.level`, updated by `addSighting`).

**Thin shims** (kept for backward-compat imports):
- `useGameStore.ts` — delegates `addSighting` / `getCard` / `reset` to `lifeDexStore`.
- `sightingStore.ts` — delegates `storeSighting` / `getSighting` / `_clearStore` to `lifeDexStore`.
- `useMockStore.ts` — derives profile/recentSightings/todayCount/totalSpecies from `useLifeDexStore()`.
- `useMockCollection.ts` — derives `.sightings` / `.totalXp` / `.level` from `useLifeDexStore()`.
- `useSighting.ts` — calls `lifeDexStore.getSightingById(id)` synchronously (loading always false).
- `screens/mock/mockSightings.ts` — re-exports `lifeDexStore.listSightings()` snapshot.

All screens import directly from `@/store/useLifeDexStore` — the shims exist only to avoid breaking legacy test imports.

---

## Navigation structure

```
RootStack (NativeStackNavigator)
├── Onboarding           (no tab bar; navigation.replace('Tabs') on completion)
├── Tabs (BottomTabNavigator)
│   ├── Home
│   ├── Map
│   ├── Capture          (FAB-style raised centre tab; runs the pipeline)
│   ├── Collection
│   └── Leaderboard
├── Result               (modal, slide_from_bottom; sightingId param)
└── CardDetail           (modal, slide_from_bottom; cardId param)
```

Type safety: `RootStackParamList` nests tabs under a `Tabs` route using `NavigatorScreenParams<RootTabParamList>`. The `CardDetail` and `Result` screens are on the root stack so they can be pushed from any tab without nesting navigators.

---

## Risk list

| Risk | Severity | Mitigations in place | Remaining gap |
|---|---|---|---|
| Original photo accidentally made public | Critical | `private-photos` bucket has no public URL; RLS owner-only; `CardImageGenerationProvider` interface never receives `privatePhotoUri`. | Real provider adapters must not log or cache the original URI. Add integration test asserting `publicImageUri` does not contain the original URI. |
| Exact GPS of protected species leaked | Critical | `hidden=true` suppresses coordinate display in all UI components; `PublicLocation` stores only fuzzed coord; raw `GeoPoint` is local-only. | Verify `public_sightings` view does not expose `private_location` (confirmed in `policies.sql`). Add E2E test. |
| Face/person in background not detected by real vision provider | High | Moderation runs first with a dedicated moderation API call, not the same call as species recognition. | Tune `MIN_QUALITY_SCORE` and add a second-pass moderation sweep for cards before they enter the public card-images bucket. |
| Zoo animal scored as wild legendary | Medium | `captiveStatus` is always set by the vision provider; scoring engine caps zoo_captive at 15 XP and forces `common`. | Real vision provider must reliably detect captive context (enclosures, exhibit signs). Add fallback: if `isPrivateInterior` matches known zoo interior patterns, force `zoo_captive`. |
| Species rule sensitivity overridden by low-confidence recognition | Medium | `ScoreInput.sensitivity` comes from `RecognitionResult.sensitivity` which comes from the vision provider or `species_rules` lookup. | Pipeline must prefer `species_rules.sensitivity` over vision provider guess when a species_rules match exists. Not yet implemented (mock uses vision provider value directly). |
| Card generation prompt leads to non-species output | Low | `CardImageGenerationProvider` interface contract specifies only card metadata as input. Mock returns a deterministic URI. | Real adapter must sanitise the prompt and validate that the generated image contains only the intended species (content safety check on output). |
| User photographs someone else's property / trespasses | Low | Onboarding ethics screen; soft `isPrivateInterior` flag. | Safety notes on cards for sensitive/protected species remind users not to trespass. Cannot be enforced programmatically; relies on user education. |
| Duplicate detection absent in mock mode | Low | `isDuplicate = false` in all mock pipelines; scoring engine handles it correctly when set. | Wire real duplicate detection against Supabase once persistence is live (see `NEXT_STEPS.md` step 7). |
