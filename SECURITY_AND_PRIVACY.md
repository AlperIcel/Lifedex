# Security and Privacy

This document describes how LifeDex handles user data, original photos, location information, and potentially sensitive content. These rules are hard-coded into the product — they are not configuration options.

---

## 1. Original photos are private

Every photo taken or picked from the gallery is treated as **private evidence** from the moment the shutter fires.

- `privatePhotoUri` is stored in the `private-photos` Supabase Storage bucket.
- The bucket is **private**. RLS policies allow read access only to `auth.uid() = owner_id`. No public URL is ever generated for this bucket.
- The original photo is **never** passed to the card-generation provider. Only the AI-generated recreation (`publicImageUri`) appears on public surfaces.
- `privatePhotoUri` is never rendered in any screen other than local device memory during the pipeline run. The `CardView`, `CardDetailScreen`, `ResultScreen`, `CollectionScreen`, and `MapScreen` components all read `publicImageUri` only.

## 2. Public cards are AI recreations

The collectible card shown to other users, stored in `card-images`, and displayed on the map is an **AI-generated illustration** of the species — not a crop, filter, or edit of the original photo.

This distinction is structural:
- `CardImageGenerationProvider.generateCard()` receives `CardMetadata` and `RecognitionResult` — neither carries the original image URI.
- The interface contract prevents any provider implementation from accessing the private photo.

## 3. Moderation pipeline

Before anything is stored, every photo passes through `ImageModerationProvider.moderate()`. The domain function `decideModeration()` in `src/domain/moderation.ts` applies these rules:

### Hard blocks (allowed = false, pipeline stops)

| Signal | Reason |
|---|---|
| `hasFace = true` | Human face — privacy protection |
| `hasPerson = true` (and no face) | Human body — privacy protection |
| `hasLicensePlate = true` | Vehicle registration plate — PII |
| `qualityScore < 0.4` | Image too poor to reliably identify species |

### Soft flags (allowed = true, metadata noted)

| Signal | Action |
|---|---|
| `hasHouseNumber = true` | Region flagged in `strippedRegions`; can be blurred by a real provider |
| `isPrivateInterior = true` | Noted in `reasons`; user is informed |

No partial storage occurs on a hard block. The pipeline returns an error state to `CaptureScreen` and nothing is written to Supabase.

### GDPR relevance of moderation

Animals, plants, trees, and mushrooms are **not personal data** under GDPR. However, a photo of a bird perched on a windowsill might incidentally contain a face or a readable address. The moderation pipeline blocks or strips those regions before any processing continues, making the stored data non-personal by the time it reaches Supabase.

If a user photographs another person as the primary subject (not a species), the face/person hard block fires and no data is stored.

## 4. Location fuzzing

Raw GPS coordinates from `Location.getCurrentPositionAsync()` are **never written to any database table or passed to any provider**. The true `GeoPoint` exists only in the local scope of the `CaptureScreen` pipeline function and is discarded after `locationPrivacy.getPublicLocation()` returns.

What is stored is a `PublicLocation` with a fuzzed grid-snapped coordinate and a `precisionMeters` value indicating the uncertainty radius:

| Sensitivity tier | Public precision | Notes |
|---|---|---|
| `none` | ~175 m | General species; approximate neighbourhood shown |
| `low` | ~500 m | Common wildlife; rough area shown |
| `sensitive` | ~2 000 m | Rare species; only city-district level |
| `protected` | ~10 000 m + `hidden=true` | Protected / endangered species |

When `PublicLocation.hidden = true`:
- `CardDetailScreen` shows "Hidden for species protection" instead of coordinates.
- `MapScreen` renders only a `FuzzCircle` (a filled circle over the rough area) with no precise pin or callout.
- The `public_sightings` database view filters nothing differently — it is the UI components that enforce the no-display rule for `hidden=true` locations.

### Protected species and nesting sites

Species with `sensitivity = 'protected'` in `species_rules` always produce `hidden=true` public locations regardless of the actual coordinate. This covers:
- Endangered birds (e.g. White-tailed Eagle, Little Owl)
- Protected plants (e.g. Lady's Slipper Orchid)
- Protected fungi (e.g. Ghost Orchid Fungus)

Additional safety notes surface on the card for these species warning users not to disturb nesting sites, not to collect protected plants, and not to share the exact location externally.

## 5. Zoo / captive animals

Animals identified as `zoo_captive` or `domestic` are stored in a separate logical category:
- Capped XP: `zoo_captive` max 15 XP, `domestic` max 25 XP.
- `zoo_captive` rarity is forced to `common` regardless of species base rarity.
- The generated column `sightings.is_zoo_captive` lets the leaderboard view exclude captive sightings from wild discovery rankings.
- Cards display a "Zoo / Captive" or "Domestic" badge so other users understand the context.

This prevents gamification pressure to visit zoos or keep captive animals to farm rare species XP.

## 6. Discouraging harmful behaviour

Safety notes are appended to `CardMetadata.safetyNotes` (and shown in `CardDetailScreen` and `ResultScreen`) when:
- `sensitivity` is `sensitive` or `protected` — warns not to approach, not to disturb nesting sites.
- `captiveStatus` is `zoo_captive` or `domestic` — notes the captive context.

The onboarding screen (step 2) explicitly presents three ethics rules:
- Do not disturb animals or nests.
- Do not trespass to reach a sighting location.
- Do not collect protected plants.

No in-app feature rewards repeated visits to the same nest, approaching young animals, or collecting specimens.

## 7. User data stored in Supabase

| Table | Who can read | Who can write |
|---|---|---|
| `profiles` | Owner only (own row) | Owner only |
| `sightings` (full row incl. `private_location`, `original_image_path`) | Owner only | Owner only (insert) |
| `public_sightings` view | Any authenticated user | Read-only view |
| `collection_cards` | Owner only | Owner only |
| `public_collection_cards` view | Any authenticated user | Read-only view |
| `species_rules` | Any authenticated user | Admins only (no user policy) |
| `moderation_events` | Owner only | System only |
| `leaderboard` view | Any authenticated user | Read-only view |

All tables have Row Level Security enabled. No anonymous access is granted to any user data.

## 8. Data deletion and export (placeholders)

These features are not yet implemented. When they are, they must cover:

**Deletion**
- Delete all rows in `sightings`, `collection_cards`, `moderation_events`, `profiles` where `user_id = auth.uid()`.
- Delete all files under `private-photos/{user_id}/` and `card-images/{user_id}/` in Supabase Storage.
- Trigger Supabase Auth user deletion (`auth.admin.deleteUser()`).
- Confirm deletion is irreversible and offer a 30-day cooling-off period.

**Export (GDPR Article 20 — data portability)**
- Export all `sightings` rows (including `private_location` and `original_image_path` references) as JSON.
- Export all `collection_cards` rows.
- Export signed download URLs for all files in `private-photos/{user_id}/`.
- Return as a ZIP archive delivered to the user's registered email.

Both endpoints must be authenticated, rate-limited, and logged in `moderation_events`.

## 9. Abuse prevention

- Moderation runs **before** recognition. A blocked image never reaches the vision or card-generation providers, reducing both cost and exposure.
- `moderation_status` on sightings supports `'pending' | 'allowed' | 'blocked' | 'flagged'`. The `public_sightings` view filters to `allowed` only.
- Cards can be reported by other users (UI not yet built). Reports should flip `moderation_status` to `flagged` and suppress the card from public views pending human review.
- Admin moderation of `moderation_events` rows is the intended review workflow. No admin UI is built yet.

## 10. Secrets and credentials

- No API keys, tokens, or credentials are hardcoded anywhere in the codebase.
- All secrets are loaded from environment variables via `src/config/env.ts`, which validates them with Zod at startup.
- The Supabase anon key is the **public** anon key only — it is safe to include in the app bundle. Row Level Security enforces all access control; the anon key alone grants nothing beyond what RLS permits.
- The service role key must **never** be included in the mobile app bundle. It is for server-side admin operations only.
- `.env` is in `.gitignore`. `.env.example` contains only placeholder values.
