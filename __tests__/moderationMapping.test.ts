/**
 * Tests for the Google Vision -> moderation mapping (pure, no network).
 */
import { toSignals, mapModeration } from '../src/providers/google/moderationMapping';
import type { VisionAnnotateResponse } from '../src/providers/google/visionMapping';

const CLEAN: VisionAnnotateResponse = {
  labelAnnotations: [{ description: 'Red Fox', score: 0.95 }, { description: 'Wildlife', score: 0.9 }],
  localizedObjectAnnotations: [{ name: 'Animal', score: 0.9 }],
  safeSearchAnnotation: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'UNLIKELY' },
};

describe('toSignals', () => {
  it('flags a face from faceAnnotations', () => {
    const s = toSignals({ ...CLEAN, faceAnnotations: [{ detectionConfidence: 0.98 }] });
    expect(s.hasFace).toBe(true);
  });

  it('ignores low-confidence faces', () => {
    const s = toSignals({ ...CLEAN, faceAnnotations: [{ detectionConfidence: 0.2 }] });
    expect(s.hasFace).toBe(false);
  });

  it('flags a person object', () => {
    const s = toSignals({ ...CLEAN, localizedObjectAnnotations: [{ name: 'Person', score: 0.9 }] });
    expect(s.hasPerson).toBe(true);
  });

  it('flags a license plate object', () => {
    const s = toSignals({ ...CLEAN, localizedObjectAnnotations: [{ name: 'License plate', score: 0.8 }] });
    expect(s.hasLicensePlate).toBe(true);
  });

  it('uses the top label score as the quality proxy', () => {
    expect(toSignals(CLEAN).qualityScore).toBeCloseTo(0.95);
  });
});

describe('mapModeration', () => {
  it('allows a clean wildlife photo', () => {
    const r = mapModeration(CLEAN);
    expect(r.allowed).toBe(true);
  });

  it('blocks a photo with a face', () => {
    const r = mapModeration({ ...CLEAN, faceAnnotations: [{ detectionConfidence: 0.97 }] });
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/face/i);
  });

  it('blocks a photo with a person (body only)', () => {
    const r = mapModeration({ ...CLEAN, localizedObjectAnnotations: [{ name: 'Person', score: 0.9 }] });
    expect(r.allowed).toBe(false);
  });

  it('blocks a photo with a license plate', () => {
    const r = mapModeration({ ...CLEAN, localizedObjectAnnotations: [{ name: 'License plate', score: 0.8 }] });
    expect(r.allowed).toBe(false);
    expect(r.strippedRegions).toContain('license_plate');
  });

  it('blocks inappropriate content via SafeSearch', () => {
    const r = mapModeration({ ...CLEAN, safeSearchAnnotation: { adult: 'VERY_LIKELY' } });
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/inappropriate/i);
  });

  it('does not block on POSSIBLE safe-search levels', () => {
    const r = mapModeration({ ...CLEAN, safeSearchAnnotation: { adult: 'POSSIBLE', racy: 'POSSIBLE' } });
    expect(r.allowed).toBe(true);
  });
});

describe('mapModeration — real Vision output (regression fixtures)', () => {
  // Real response for a portrait photo: one face + a Person object.
  const realPortrait: VisionAnnotateResponse = {
    labelAnnotations: [{ description: 'Suit', score: 0.9 }],
    localizedObjectAnnotations: [
      { name: 'Person', score: 0.95 },
      { name: 'Tie', score: 0.9 },
      { name: 'Coat', score: 0.85 },
    ],
    faceAnnotations: [{ detectionConfidence: 0.98 }],
    safeSearchAnnotation: { adult: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY' },
  };

  // Real response for the dog photo: no faces, no person.
  const realDog: VisionAnnotateResponse = {
    labelAnnotations: [{ description: 'Dog', score: 1.0 }],
    localizedObjectAnnotations: [{ name: 'Dog', score: 0.98 }],
    faceAnnotations: [],
    safeSearchAnnotation: { adult: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY' },
  };

  it('blocks a real portrait (face + person)', () => {
    expect(mapModeration(realPortrait).allowed).toBe(false);
  });

  it('allows a real animal photo', () => {
    expect(mapModeration(realDog).allowed).toBe(true);
  });
});
