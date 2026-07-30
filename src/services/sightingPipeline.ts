/**
 * sightingPipeline — the ONE place that turns a captured image into a persisted
 * Sighting + CollectionCard.
 *
 * Previously this logic was duplicated: CaptureScreen ran the full pipeline and
 * threw the result away, then ResultScreen re-ran it independently and saved
 * nowhere. This service centralises it: run it once on capture, persist into
 * useLifeDexStore, and let ResultScreen read the persisted row by id.
 *
 * Order (all via getProviders(), mock by default, NO API keys):
 *   reference/store private evidence image (mock) → moderate → recognize →
 *   score (rarity/XP) → apply location privacy → build card metadata →
 *   generate/mock public card image → persist exactly ONE Sighting + ONE
 *   CollectionCard → return the real ids.
 *
 * Privacy rules preserved:
 *   - privatePhotoUri holds the original image and is never used as a public id.
 *   - location is fuzzed through locationPrivacy before storage.
 *
 * On moderation block: NOTHING is persisted; the caller receives
 * `{ blocked: true, reasons }` so it can show a blocked state.
 */
import { resolveCaptiveStatus, isPubliclyReachable, type FindSetting } from '@/domain/accessibility';
import { buildCardMetadata } from '@/domain/cardMetadata';
import { evaluateDedup } from '@/domain/dedup';
import { isBonusFind, qualifiesForMacroLens } from '@/domain/lab';
import { applySpeciesRule } from '@/domain/speciesRules';
import { nextStreak } from '@/domain/streak';
import type { GeoPoint, Sighting } from '@/domain/types';
import { getProviders } from '@/providers';
import { loadStreakMeta, saveStreakMeta } from '@/store/persistence';
import { labStore } from '@/store/lab';
import { lifeDexStore, type CollectionCard } from '@/store/useLifeDexStore';
import { pushSighting } from '@/lib/community';
import { newId } from '@/utils/id';
import { features } from '@/config/features';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CreateSightingInput {
  /** The captured photo URI — PRIVATE evidence. */
  imageUri: string;
  /** Optional true GPS point; fuzzed before storage. */
  location?: GeoPoint;
  /**
   * Optional MOCK-MODE hint (e.g. 'cat', 'frog'). Lets the Capture screen pick a
   * predictable test subject while recognition is simulated. Real vision
   * providers ignore this — it has no effect once a real provider is wired up.
   */
  mockSpecies?: string;
  /**
   * Where the player says they found it (capture-time toggle). 'home' marks the
   * catch as domestic — capped rarity, private, and not shown as huntable on the
   * map or shared to the community. Defaults to outdoors/public when unset.
   * See src/domain/accessibility.ts.
   */
  findSetting?: FindSetting;
}

export interface CreateSightingOk {
  ok: true;
  blocked: false;
  /**
   * True when this species was ALREADY in the collection (a re-catch). No new
   * record is created; sightingId/cardId point at the existing entry so the UI
   * can navigate to it.
   */
  duplicate: boolean;
  sightingId: string;
  cardId: string;
  /** Common name of the species (handy for duplicate messaging). */
  species: string;
  /** True when this species is NOT in the curated catalogue — a Solo Lab "special find". */
  isBonusFind: boolean;
}

export interface CreateSightingBlocked {
  ok: false;
  blocked: true;
  reasons: string[];
}

export type CreateSightingResult = CreateSightingOk | CreateSightingBlocked;

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * Run the full identify-and-persist pipeline for a captured image.
 *
 * Resolves to the real persisted ids on success, or a blocked result the caller
 * can render. Throws only on unexpected provider failures (caller should
 * try/catch and surface an error state).
 */
export async function createSightingFromImage(
  input: CreateSightingInput,
): Promise<CreateSightingResult> {
  const { imageUri, location, mockSpecies } = input;
  const providers = getProviders();

  // The private evidence image is "stored" as-is in mock mode (the URI is the
  // reference). A real adapter would upload it to private storage here.
  const privatePhotoUri = imageUri;

  // 1. Moderation — gate before any recognition / generation.
  const moderation = await providers.moderation.moderate(imageUri);
  if (!moderation.allowed) {
    const reasons =
      moderation.reasons.length > 0
        ? moderation.reasons
        : ['This photo cannot be processed due to content policy.'];
    return { ok: false, blocked: true, reasons };
  }

  // 2. Recognition. mockSpecies is an optional mock-mode hint; ignored by real providers.
  const rawRecognition = await providers.vision.recognize(imageUri, mockSpecies);
  // Override sensitivity from the species catalogue so protected/at-risk species
  // are actually hidden/fuzzed even when the provider reported 'none'.
  const recognition = applySpeciesRule(rawRecognition);

  // The player's capture-time "outdoors vs at home" choice overrides the
  // recogniser's captiveStatus — the CV can't see whether a plant is potted or a
  // creature is a pet. This one value drives rarity cap, map reach, and sharing.
  const captiveStatus = resolveCaptiveStatus(recognition.captiveStatus, input.findSetting);

  // 2b. De-duplication — the same species within ~1 km is a re-catch: it returns
  // the nearby entry without creating a new record or crediting XP. The SAME
  // species further away is a fresh discovery (the "hunt" rule — see dedup.ts).
  const dedup = evaluateDedup({
    recognition,
    existing: lifeDexStore.listSightings(),
    location,
  });
  if (dedup.alreadyDiscovered && dedup.existingSightingId !== undefined) {
    return {
      ok: true,
      blocked: false,
      duplicate: true,
      sightingId: dedup.existingSightingId,
      cardId: `card-${dedup.existingSightingId}`,
      species: recognition.commonName,
      isBonusFind: isBonusFind(recognition),
    };
  }

  // First discovery = no prior sighting of this species ANYWHERE (drives the
  // +50% scoring bonus and the "new species" moment). dedup.priorCount counts
  // priors of this species at any distance; 0 = we've never caught it before.
  // (Previously hardcoded true, which made the bonus universal and meaningless.)
  const isFirstDiscovery = dedup.priorCount === 0;

  // 2c. Daily streak — a new discovery advances the consecutive-day streak; the
  // scoring engine gives a small bonus for it.
  const nowISO = new Date().toISOString();
  const streakMeta = await loadStreakMeta();
  const streak = nextStreak(streakMeta.lastCaptureISO, nowISO, streakMeta.streak);

  // 3. Scoring (rarity / XP). The Solo Lab's Makro-Linse gadget only ADDS
  // XP — it never gates the core catch flow — so it's computed here purely
  // to feed the scoring engine's optional bonus step (scoring.ts's macroLens
  // handling), regardless of whether the player owns the gadget at all.
  const macroLens = labStore.ownsGadget('makro-linse') && qualifiesForMacroLens(recognition);
  const score = providers.rarityScoring.score({
    recognition,
    confidence: recognition.confidence,
    isDuplicate: false,
    captiveStatus,
    sensitivity: recognition.sensitivity,
    qualityOk: moderation.qualityOk,
    isFirstDiscovery,
    streak,
    macroLens,
  });

  // 4. Location privacy — fuzz the true point (fallback to 0,0 when absent).
  const rawGeo: GeoPoint = location ?? { lat: 0, lng: 0 };
  const publicLocation = providers.locationPrivacy.getPublicLocation(
    rawGeo,
    recognition.sensitivity,
  );

  // 5. Card metadata.
  const card = buildCardMetadata(recognition, score);

  // 6. Generate the card image from the private photo (crop in google mode,
  // placeholder in mock). On failure, fall back to the emoji placeholder URI so
  // a capture never fails just because image processing did.
  let publicImageUri: string;
  try {
    ({ publicImageUri } = await providers.cardGen.generateCard(card, recognition, imageUri));
  } catch {
    publicImageUri = `mock-card://${recognition.category}`;
  }

  // 7. Persist exactly ONE Sighting + ONE CollectionCard.
  const sightingId = newId('sighting');
  const sighting: Sighting = {
    id: sightingId,
    userId: lifeDexStore.getProfile().id,
    createdAt: new Date().toISOString(),
    category: recognition.category,
    commonName: recognition.commonName,
    scientificName: recognition.scientificName,
    confidence: recognition.confidence,
    rarity: score.rarity,
    xp: score.xp,
    isFirstDiscovery,
    captiveStatus,
    sensitivity: recognition.sensitivity,
    privatePhotoUri, // PRIVATE — never exposed publicly
    publicImageUri,
    publicLocation,
    card,
    moderation,
    observationsCount: recognition.observationsCount,
    taxonId: recognition.taxonId,
  };

  const collectionCard: CollectionCard = {
    id: `card-${sightingId}`,
    sightingId,
    card,
    publicImageUri,
    rarity: score.rarity,
    createdAt: sighting.createdAt,
  };

  const { cardId } = lifeDexStore.addSighting(sighting, collectionCard, streak);

  // Persist the advanced streak now that a new species was actually recorded.
  void saveStreakMeta({ lastCaptureISO: nowISO, streak });

  // Solo Lab research points — ONLY the non-duplicate path reaches here (a
  // duplicate returns earlier, above), so a re-catch never credits RP.
  // Fire-and-forget: the trickle is a background passive-income stream, not
  // shown with fanfare on this catch (unlike labStore.submitSample's payout).
  labStore.creditCatchRp(score.rarity, isFirstDiscovery, recognition.category, nowISO);

  // Share the public-safe version to the community feed (best-effort; no-op when
  // Supabase is disabled). Fire-and-forget so it never blocks the capture.
  // Gated behind features.communitySharing: v1 ships single-player only (see
  // STATUS.md "Release plan") — flip the flag on for v1.1's community layer.
  // Private (at-home) finds are NEVER shared — their location is the player's
  // home — so a shared feed/map only ever carries publicly-reachable wild finds.
  if (features.communitySharing && isPubliclyReachable(captiveStatus)) {
    void pushSighting(sighting);
  }

  return {
    ok: true,
    blocked: false,
    duplicate: false,
    sightingId,
    cardId,
    species: recognition.commonName,
    isBonusFind: isBonusFind(recognition),
  };
}
