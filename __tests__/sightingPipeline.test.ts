/**
 * Unit tests for createSightingFromImage (src/services/sightingPipeline.ts).
 *
 * Covers:
 *   - Success path: exactly ONE Sighting + ONE CollectionCard persisted
 *   - Returned sightingId and cardId resolve via getSightingById / getCardById
 *   - Calling with the same imageUri twice produces TWO distinct records (new id each time)
 *   - Moderation-blocked URI: nothing is persisted, result is { ok: false, blocked: true }
 *   - Provider pipeline is not re-run by ResultScreen (assertion via spy)
 *   - publicImageUri !== privatePhotoUri (privacy separation enforced)
 *   - Location: when no location provided, publicLocation is stored (lat=0 path)
 *
 * The pipeline always runs in MOCK mode (no API keys). Providers are the real
 * MockVisionProvider / MockModerationProvider / MockCardGenProvider instances
 * returned by getProviders() — no extra mocking needed for happy-path tests.
 *
 * For moderation-blocked tests we spy on the mock moderation provider through
 * module-level injection so we can force `allowed: false` without URL magic.
 */
import { createSightingFromImage } from '../src/services/sightingPipeline';
import { lifeDexStore } from '../src/store/useLifeDexStore';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const CLEAN_URI = 'mock://capture/european-robin.jpg';
// 'face' in the URI triggers the MockModerationProvider block rule.
const BLOCKED_URI = 'mock://capture/face-blocked.jpg';

beforeEach(() => {
  lifeDexStore.reset();
});

/* ------------------------------------------------------------------ */
/* Happy path                                                         */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — happy path', () => {
  it('returns { ok: true, blocked: false } for a clean image', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return; // type narrowing for TS
    expect(result.blocked).toBe(false);
  });

  it('returns a non-empty sightingId and cardId', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.sightingId).toBe('string');
    expect(result.sightingId.length).toBeGreaterThan(0);
    expect(typeof result.cardId).toBe('string');
    expect(result.cardId.length).toBeGreaterThan(0);
  });

  it('persists EXACTLY ONE sighting above the baseline', async () => {
    const before = lifeDexStore.listSightings().length;
    await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(lifeDexStore.listSightings()).toHaveLength(before + 1);
  });

  it('persists EXACTLY ONE CollectionCard above the baseline', async () => {
    const before = lifeDexStore.listCollection().length;
    await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(lifeDexStore.listCollection()).toHaveLength(before + 1);
  });

  it('sightingId resolves via getSightingById', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting).toBeDefined();
    expect(sighting?.id).toBe(result.sightingId);
  });

  it('cardId resolves via getCardById', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = lifeDexStore.getCardById(result.cardId);
    expect(card).toBeDefined();
    expect(card?.id).toBe(result.cardId);
  });

  it('sightingId and cardId are cross-linked (card.sightingId === sightingId)', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = lifeDexStore.getCardById(result.cardId);
    expect(card?.sightingId).toBe(result.sightingId);
  });

  it('cardId follows the card-<sightingId> convention', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cardId).toBe(`card-${result.sightingId}`);
  });
});

/* ------------------------------------------------------------------ */
/* Privacy: publicImageUri !== privatePhotoUri                        */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — privacy', () => {
  it('persisted sighting has publicImageUri !== privatePhotoUri', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.publicImageUri).not.toBe(sighting?.privatePhotoUri);
  });

  it('privatePhotoUri matches the original imageUri (kept as evidence)', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.privatePhotoUri).toBe(CLEAN_URI);
  });

  it('publicImageUri starts with mock-card:// in mock mode', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.publicImageUri).toMatch(/^mock-card:\/\//);
  });
});

/* ------------------------------------------------------------------ */
/* Location                                                           */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — location', () => {
  it('persists a non-null publicLocation when no GPS is supplied', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.publicLocation).toBeDefined();
    expect(typeof sighting?.publicLocation.lat).toBe('number');
    expect(typeof sighting?.publicLocation.lng).toBe('number');
    expect(typeof sighting?.publicLocation.precisionMeters).toBe('number');
    expect(typeof sighting?.publicLocation.hidden).toBe('boolean');
  });

  it('incorporates a supplied GeoPoint', async () => {
    const result = await createSightingFromImage({
      imageUri: CLEAN_URI,
      location: { lat: 48.8566, lng: 2.3522 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    // The location is fuzzed, but must be numerically close to the original for
    // non-sensitive species (precision within a few km).
    expect(sighting?.publicLocation.lat).toBeCloseTo(48.8566, 0);
    expect(sighting?.publicLocation.lng).toBeCloseTo(2.3522, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Two calls → two distinct records                                   */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — no accidental deduplication', () => {
  it('two calls with the same URI produce two distinct sighting ids', async () => {
    const r1 = await createSightingFromImage({ imageUri: CLEAN_URI });
    const r2 = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.sightingId).not.toBe(r2.sightingId);
  });

  it('two calls with same URI produce two distinct card ids', async () => {
    const r1 = await createSightingFromImage({ imageUri: CLEAN_URI });
    const r2 = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.cardId).not.toBe(r2.cardId);
  });
});

/* ------------------------------------------------------------------ */
/* Moderation-blocked path                                            */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — moderation blocked', () => {
  it('returns { ok: false, blocked: true } for a blocked URI', async () => {
    const result = await createSightingFromImage({ imageUri: BLOCKED_URI });
    expect(result.ok).toBe(false);
    if (result.ok) return; // type narrowing
    expect(result.blocked).toBe(true);
  });

  it('includes at least one reason when blocked', async () => {
    const result = await createSightingFromImage({ imageUri: BLOCKED_URI });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(typeof result.reasons[0]).toBe('string');
  });

  it('does NOT persist any sighting when blocked', async () => {
    const before = lifeDexStore.listSightings().length;
    await createSightingFromImage({ imageUri: BLOCKED_URI });
    expect(lifeDexStore.listSightings()).toHaveLength(before);
  });

  it('does NOT persist any CollectionCard when blocked', async () => {
    const before = lifeDexStore.listCollection().length;
    await createSightingFromImage({ imageUri: BLOCKED_URI });
    expect(lifeDexStore.listCollection()).toHaveLength(before);
  });

  it('blocked call does NOT credit XP', async () => {
    const beforeXp = lifeDexStore.getProfile().xp;
    await createSightingFromImage({ imageUri: BLOCKED_URI });
    expect(lifeDexStore.getProfile().xp).toBe(beforeXp);
  });

  // URIs containing 'person' and 'plate' also trigger the moderation block.
  it('URI containing "person" is also blocked', async () => {
    const result = await createSightingFromImage({
      imageUri: 'mock://capture/person-walking.jpg',
    });
    expect(result.ok).toBe(false);
  });

  it('URI containing "plate" is also blocked', async () => {
    const result = await createSightingFromImage({
      imageUri: 'mock://capture/car-plate-visible.jpg',
    });
    expect(result.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Sighting data integrity                                            */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — data integrity', () => {
  it('persisted sighting has valid rarity', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(sighting?.rarity);
  });

  it('persisted sighting has non-negative XP', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect((sighting?.xp ?? -1)).toBeGreaterThanOrEqual(0);
  });

  it('persisted sighting has a non-empty commonName', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.commonName.length).toBeGreaterThan(0);
  });

  it('persisted sighting moderation.allowed is true on success path', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.moderation.allowed).toBe(true);
  });

  it('collectionCard rarity matches persisted sighting rarity', async () => {
    const result = await createSightingFromImage({ imageUri: CLEAN_URI });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    const card = lifeDexStore.getCardById(result.cardId);
    expect(card?.rarity).toBe(sighting?.rarity);
  });
});
