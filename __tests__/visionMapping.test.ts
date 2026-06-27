/**
 * Tests for the Google Vision -> RecognitionResult mapping (pure, no network).
 */
import { mapVisionResponse, type VisionAnnotateResponse } from '../src/providers/google/visionMapping';

describe('mapVisionResponse — category inference', () => {
  it('classifies an animal (priority over everything)', () => {
    const res: VisionAnnotateResponse = {
      labelAnnotations: [
        { description: 'Red fox', score: 0.96 },
        { description: 'Mammal', score: 0.95 },
        { description: 'Wildlife', score: 0.9 },
      ],
      webDetection: {
        bestGuessLabels: [{ label: 'red fox' }],
        webEntities: [{ description: 'Vulpes vulpes', score: 0.8 }],
      },
    };
    const r = mapVisionResponse(res);
    expect(r.category).toBe('animal');
    expect(r.commonName).toBe('Red Fox');
    expect(r.scientificName).toBe('Vulpes vulpes');
    expect(r.confidence).toBeCloseTo(0.96);
    expect(r.captiveStatus).toBe('wild');
  });

  it('classifies a mushroom', () => {
    const r = mapVisionResponse({
      labelAnnotations: [{ description: 'Mushroom', score: 0.9 }, { description: 'Fungus', score: 0.88 }],
    });
    expect(r.category).toBe('mushroom');
  });

  it('classifies a tree', () => {
    const r = mapVisionResponse({
      labelAnnotations: [{ description: 'Tree', score: 0.92 }, { description: 'Oak', score: 0.8 }],
    });
    expect(r.category).toBe('tree');
  });

  it('classifies a plant/flower', () => {
    const r = mapVisionResponse({
      labelAnnotations: [{ description: 'Flower', score: 0.93 }, { description: 'Petal', score: 0.7 }],
    });
    expect(r.category).toBe('plant');
  });

  it('falls back to unknown when nothing matches', () => {
    const r = mapVisionResponse({
      labelAnnotations: [{ description: 'Rectangle', score: 0.6 }],
    });
    expect(r.category).toBe('unknown');
  });
});

describe('mapVisionResponse — details', () => {
  it('detects domestic animals', () => {
    const r = mapVisionResponse({
      labelAnnotations: [{ description: 'Dog', score: 0.98 }, { description: 'Pet', score: 0.9 }],
      webDetection: { bestGuessLabels: [{ label: 'labrador retriever' }] },
    });
    expect(r.category).toBe('animal');
    expect(r.captiveStatus).toBe('domestic');
    expect(r.commonName).toBe('Labrador Retriever');
  });

  it('uses the top object name when no best-guess label exists', () => {
    const r = mapVisionResponse({
      localizedObjectAnnotations: [{ name: 'Bird', score: 0.91 }],
      labelAnnotations: [{ description: 'Animal', score: 0.8 }],
    });
    expect(r.commonName).toBe('Bird');
    expect(r.confidence).toBeCloseTo(0.91);
  });

  it('omits scientificName when no binomial is present', () => {
    const r = mapVisionResponse({
      labelAnnotations: [{ description: 'Bird', score: 0.8 }],
      webDetection: { webEntities: [{ description: 'Birdwatching' }] },
    });
    expect(r.scientificName).toBeUndefined();
  });

  it('clamps confidence into 0..1 and handles an empty response', () => {
    const r = mapVisionResponse({});
    expect(r.commonName).toBe('Unknown');
    expect(r.category).toBe('unknown');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});
