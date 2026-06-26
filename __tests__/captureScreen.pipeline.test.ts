/**
 * Unit tests for the Capture → Result persistence bridge.
 *
 * STABILIZATION: the old `sightingStore` shim was removed. The bridge is now the
 * central `lifeDexStore`: CaptureScreen's pipeline persists via addSighting and
 * ResultScreen reads back via getSightingById. These tests verify that contract
 * (store, retrieve, idempotency, private-photo isolation) directly on the store.
 *
 * Key change from the pre-stabilization version:
 *   - The "overwrite test" (second storeSighting with same id replaces first) has
 *     become an IDEMPOTENCY test: a second write with the same id is a no-op and
 *     the first write's data is preserved (XP is never double-credited).
 *
 * The pipeline itself (moderate → recognize → score → buildCardMetadata →
 * generateCard) is covered by the provider mock tests and the scoring /
 * moderation domain tests. See sightingPipeline.test.ts for end-to-end pipeline
 * coverage via createSightingFromImage.
 */

import { lifeDexStore } from '../src/store/useLifeDexStore';
import type { Sighting } from '../src/domain/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeSighting(id: string): Sighting {
  return {
    id,
    userId: 'test-user',
    createdAt: new Date().toISOString(),
    category: 'animal',
    commonName: 'European Robin',
    scientificName: 'Erithacus rubecula',
    confidence: 0.93,
    rarity: 'uncommon',
    xp: 42,
    captiveStatus: 'wild',
    sensitivity: 'none',
    privatePhotoUri: 'file://private/photo.jpg', // PRIVATE — never public
    publicImageUri: 'mock-card://animal/european-robin/uncommon/42',
    publicLocation: {
      lat: 51.5,
      lng: -0.1,
      precisionMeters: 175,
      hidden: false,
    },
    card: {
      name: 'European Robin',
      category: 'animal',
      rarity: 'uncommon',
      xp: 42,
      description: 'A living creature (Erithacus rubecula) — European Robin.',
      stats: { rarity: 'uncommon', 'confidence%': 93, captive: 'No' },
    },
    moderation: {
      allowed: true,
      reasons: [],
      strippedRegions: [],
      qualityOk: true,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('capture → result persistence bridge (lifeDexStore)', () => {
  beforeEach(() => {
    lifeDexStore.reset();
  });

  it('returns undefined for an unknown id', () => {
    expect(lifeDexStore.getSightingById('does-not-exist')).toBeUndefined();
  });

  it('stores a sighting and retrieves it by id', () => {
    const s = makeSighting('s-001');
    lifeDexStore.addSighting(s);
    expect(lifeDexStore.getSightingById('s-001')).toEqual(s);
  });

  it('is idempotent on the same id (first write wins)', () => {
    // addSighting is idempotent: a second write with an existing id is ignored
    // so XP is never double-credited.
    const s1 = makeSighting('s-002');
    const s2 = { ...makeSighting('s-002'), xp: 999 };
    lifeDexStore.addSighting(s1);
    lifeDexStore.addSighting(s2);
    expect(lifeDexStore.getSightingById('s-002')?.xp).toBe(s1.xp);
  });

  it('stores multiple sightings independently', () => {
    const a = makeSighting('s-100');
    const b = makeSighting('s-101');
    lifeDexStore.addSighting(a);
    lifeDexStore.addSighting(b);
    expect(lifeDexStore.getSightingById('s-100')?.id).toBe('s-100');
    expect(lifeDexStore.getSightingById('s-101')?.id).toBe('s-101');
  });

  it('persists a matching collection card for the sighting', () => {
    const s = makeSighting('s-150');
    const { cardId } = lifeDexStore.addSighting(s);
    const card = lifeDexStore.getCardById(cardId);
    expect(card?.sightingId).toBe('s-150');
    expect(card?.publicImageUri).toBe(s.publicImageUri);
  });

  it('private photo URI is never exposed in the public card field', () => {
    const s = makeSighting('s-200');
    lifeDexStore.addSighting(s);
    const retrieved = lifeDexStore.getSightingById('s-200');
    // publicImageUri must not equal the private photo URI
    expect(retrieved?.publicImageUri).not.toBe(retrieved?.privatePhotoUri);
    // privatePhotoUri should be kept as stored (private evidence)
    expect(retrieved?.privatePhotoUri).toBe('file://private/photo.jpg');
  });
});
