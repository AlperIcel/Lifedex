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
import { buildCardMetadata } from '@/domain/cardMetadata';
import type { GeoPoint, Sighting } from '@/domain/types';
import { getProviders } from '@/providers';
import { lifeDexStore, type CollectionCard } from '@/store/useLifeDexStore';
import { newId } from '@/utils/id';

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
}

export interface CreateSightingSuccess {
  ok: true;
  blocked: false;
  sightingId: string;
  cardId: string;
}

export interface CreateSightingBlocked {
  ok: false;
  blocked: true;
  reasons: string[];
}

export type CreateSightingResult = CreateSightingSuccess | CreateSightingBlocked;

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
  const recognition = await providers.vision.recognize(imageUri, mockSpecies);

  // 3. Scoring (rarity / XP).
  const score = providers.rarityScoring.score({
    recognition,
    confidence: recognition.confidence,
    isDuplicate: false,
    captiveStatus: recognition.captiveStatus,
    sensitivity: recognition.sensitivity,
    qualityOk: moderation.qualityOk,
    isFirstDiscovery: true,
    streak: 0,
  });

  // 4. Location privacy — fuzz the true point (fallback to 0,0 when absent).
  const rawGeo: GeoPoint = location ?? { lat: 0, lng: 0 };
  const publicLocation = providers.locationPrivacy.getPublicLocation(
    rawGeo,
    recognition.sensitivity,
  );

  // 5. Card metadata.
  const card = buildCardMetadata(recognition, score);

  // 6. Generate the PUBLIC card image (mock: deterministic URI).
  const { publicImageUri } = await providers.cardGen.generateCard(card, recognition);

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
    captiveStatus: recognition.captiveStatus,
    sensitivity: recognition.sensitivity,
    privatePhotoUri, // PRIVATE — never exposed publicly
    publicImageUri,
    publicLocation,
    card,
    moderation,
  };

  const collectionCard: CollectionCard = {
    id: `card-${sightingId}`,
    sightingId,
    card,
    publicImageUri,
    rarity: score.rarity,
    createdAt: sighting.createdAt,
  };

  const { cardId } = lifeDexStore.addSighting(sighting, collectionCard);

  return { ok: true, blocked: false, sightingId, cardId };
}
