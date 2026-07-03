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
        webEntities: [
          { description: 'Red fox', score: 1.3 },
          { description: 'Vulpes vulpes', score: 0.8 },
        ],
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

describe('mapVisionResponse — real Vision output (regression fixture)', () => {
  // Actual response from Google Cloud Vision for a Golden Retriever photo.
  // bestGuess was the useless "imagenet image example" — the fix must fall
  // through to the web entity "Golden Retriever" instead.
  const realGoldenRetriever: VisionAnnotateResponse = {
    labelAnnotations: [
      { description: 'Dog', score: 1.0 },
      { description: 'Carnivores', score: 0.96 },
      { description: 'Puppy', score: 0.95 },
      { description: 'Retriever', score: 0.89 },
      { description: 'Snout', score: 0.86 },
      { description: 'Golden Retriever', score: 0.81 },
      { description: 'Gun dog', score: 0.8 },
      { description: 'Canidae', score: 0.79 },
    ],
    localizedObjectAnnotations: [{ name: 'Dog', score: 0.98 }],
    webDetection: {
      bestGuessLabels: [{ label: 'imagenet image example' }],
      webEntities: [
        { description: 'Golden Retriever', score: 1.4 },
        { description: 'Tatra Shepherd Dog', score: 0.9 },
        { description: 'Retriever', score: 0.8 },
        { description: 'Image', score: 0.5 },
        { description: 'ImageNet', score: 0.4 },
      ],
    },
  };

  it('ignores the junk best-guess and names it from the web entity', () => {
    const r = mapVisionResponse(realGoldenRetriever);
    expect(r.category).toBe('animal');
    expect(r.commonName).toBe('Golden Retriever');
    expect(r.captiveStatus).toBe('domestic');
    expect(r.confidence).toBeCloseTo(0.98);
  });

  // Actual response for a sunflower photo — best-guess was "sunflower profile"
  // (an image title); the web entity "Common sunflower" is the right name.
  const realSunflower: VisionAnnotateResponse = {
    labelAnnotations: [
      { description: 'Flower', score: 0.99 },
      { description: 'Yellow', score: 0.98 },
      { description: 'Petal', score: 0.98 },
      { description: 'Common sunflower', score: 0.97 },
      { description: 'Flowering plant', score: 0.86 },
    ],
    localizedObjectAnnotations: [{ name: 'Flower', score: 0.79 }],
    webDetection: {
      bestGuessLabels: [{ label: 'sunflower profile' }],
      webEntities: [
        { description: 'Common sunflower', score: 1.2 },
        { description: 'Seed', score: 0.7 },
        { description: 'Flower', score: 0.6 },
        { description: 'Photograph', score: 0.3 },
      ],
    },
  };

  it('classifies a real plant and names it from the web entity', () => {
    const r = mapVisionResponse(realSunflower);
    expect(r.category).toBe('plant');
    expect(r.commonName).toBe('Common Sunflower');
    expect(r.captiveStatus).toBe('wild');
  });
});
