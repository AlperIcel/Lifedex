/**
 * Tests for the mock-mode recognition hint.
 *
 * Covers:
 *   - MockVisionProvider.recognize(uri, hint) returns the chosen species for
 *     every MOCK_HINTS key (predictable test subject instead of hash-random).
 *   - An unknown hint falls back to the deterministic hash result.
 *   - No hint stays deterministic by imageUri (unchanged legacy behaviour).
 *   - createSightingFromImage forwards `mockSpecies` so the persisted Sighting
 *     reflects the picked subject — and still persists EXACTLY one sighting/card.
 */
import {
  MockVisionProvider,
  MOCK_HINTS,
} from '../src/providers/mock/mockVision';
import { createSightingFromImage } from '../src/services/sightingPipeline';
import { lifeDexStore } from '../src/store/useLifeDexStore';

const URI = 'mock://capture/sample.jpg';

/* ------------------------------------------------------------------ */
/* Provider-level                                                      */
/* ------------------------------------------------------------------ */

describe('MockVisionProvider — hint', () => {
  const vision = new MockVisionProvider();

  const EXPECTED: Record<string, string> = {
    cat: 'Domestic Cat',
    dog: 'Domestic Dog',
    frog: 'Common Frog',
    bird: 'European Robin',
    tree: 'English Oak',
    flower: 'Common Dandelion',
    mushroom: 'Fly Agaric',
  };

  it.each(MOCK_HINTS)('returns the chosen species for hint "%s"', async (hint) => {
    const result = await vision.recognize(URI, hint);
    expect(result.commonName).toBe(EXPECTED[hint]);
  });

  it('is case-insensitive for hints', async () => {
    const result = await vision.recognize(URI, 'CAT');
    expect(result.commonName).toBe('Domestic Cat');
  });

  it('falls back to the deterministic hash for an unknown hint', async () => {
    const hinted = await vision.recognize(URI, 'dragon');
    const plain = await vision.recognize(URI);
    expect(hinted.commonName).toBe(plain.commonName);
  });

  it('is deterministic by imageUri when no hint is given', async () => {
    const a = await vision.recognize(URI);
    const b = await vision.recognize(URI);
    expect(a.commonName).toBe(b.commonName);
  });
});

/* ------------------------------------------------------------------ */
/* Pipeline-level                                                      */
/* ------------------------------------------------------------------ */

describe('createSightingFromImage — mockSpecies hint', () => {
  beforeEach(() => {
    lifeDexStore.reset();
  });

  it('persists a sighting matching the picked subject', async () => {
    // 'dog' (Domestic Dog) is NOT in the seed, so this is a first discovery.
    const result = await createSightingFromImage({
      imageUri: URI,
      mockSpecies: 'dog',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicate).toBe(false);
    const sighting = lifeDexStore.getSightingById(result.sightingId);
    expect(sighting?.commonName).toBe('Domestic Dog');
  });

  it('still persists EXACTLY one sighting and one card with a hint', async () => {
    const beforeS = lifeDexStore.listSightings().length;
    const beforeC = lifeDexStore.listCollection().length;
    await createSightingFromImage({ imageUri: URI, mockSpecies: 'dog' });
    expect(lifeDexStore.listSightings()).toHaveLength(beforeS + 1);
    expect(lifeDexStore.listCollection()).toHaveLength(beforeC + 1);
  });
});
