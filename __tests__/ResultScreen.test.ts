/**
 * ResultScreen unit-level smoke tests.
 *
 * These tests verify the pure logic extracted from ResultScreen's pipeline
 * (provider calls, card build) without rendering React Native components.
 * Full render tests would need @testing-library/react-native configured — these
 * stay within the Jest/TS-only scope already established for the project.
 */

import { buildCardMetadata } from '@/domain/cardMetadata';
import { MockVisionProvider } from '@/providers/mock/mockVision';
import { MockModerationProvider } from '@/providers/mock/mockModeration';
import { MockCardGenProvider } from '@/providers/mock/mockCardGen';
import { DefaultLocationPrivacyProvider } from '@/domain/locationPrivacy';
import { DefaultRarityScoringProvider } from '@/domain/scoring';
import type { RecognitionResult } from '@/domain/types';

const MOCK_URI = 'mock://capture/test-image-001.jpg';
const BLOCKED_URI = 'mock://capture/face-blocked.jpg';

describe('ResultScreen pipeline (provider layer)', () => {
  const vision = new MockVisionProvider();
  const moderation = new MockModerationProvider();
  const cardGen = new MockCardGenProvider();
  const locationPrivacy = new DefaultLocationPrivacyProvider();
  const rarityScoring = new DefaultRarityScoringProvider();

  it('vision returns a valid RecognitionResult', async () => {
    const result = await vision.recognize(MOCK_URI);
    expect(result.commonName.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(['animal', 'plant', 'tree', 'mushroom', 'unknown']).toContain(result.category);
    expect(['wild', 'domestic', 'zoo_captive', 'unknown']).toContain(result.captiveStatus);
    expect(['none', 'low', 'sensitive', 'protected']).toContain(result.sensitivity);
  });

  it('moderation allows a clean URI', async () => {
    const result = await moderation.moderate(MOCK_URI);
    expect(result.allowed).toBe(true);
    expect(result.qualityOk).toBe(true);
  });

  it('moderation blocks a URI containing "face"', async () => {
    const result = await moderation.moderate(BLOCKED_URI);
    expect(result.allowed).toBe(false);
  });

  it('scoring produces non-negative XP and a valid rarity', async () => {
    const recognition = await vision.recognize(MOCK_URI);
    const scoreInput = {
      recognition,
      confidence: recognition.confidence,
      isDuplicate: false,
      captiveStatus: recognition.captiveStatus,
      sensitivity: recognition.sensitivity,
      qualityOk: true,
      isFirstDiscovery: true,
      streak: 1,
    };
    const score = rarityScoring.score(scoreInput);
    expect(score.xp).toBeGreaterThanOrEqual(0);
    expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(score.rarity);
    expect(score.reason.length).toBeGreaterThan(0);
  });

  it('buildCardMetadata returns a card with matching rarity and XP', async () => {
    const recognition = await vision.recognize(MOCK_URI);
    const scoreInput = {
      recognition,
      confidence: recognition.confidence,
      isDuplicate: false,
      captiveStatus: recognition.captiveStatus,
      sensitivity: recognition.sensitivity,
      qualityOk: true,
      isFirstDiscovery: true,
      streak: 1,
    };
    const score = rarityScoring.score(scoreInput);
    const card = buildCardMetadata(recognition, score);

    expect(card.name).toBe(recognition.commonName);
    expect(card.rarity).toBe(score.rarity);
    expect(card.xp).toBe(score.xp);
    expect(card.category).toBe(recognition.category);
    expect(typeof card.description).toBe('string');
    expect(card.description.length).toBeGreaterThan(0);
  });

  it('cardGen returns a deterministic URI based on name+rarity', async () => {
    const recognition = await vision.recognize(MOCK_URI);
    const scoreInput = {
      recognition,
      confidence: recognition.confidence,
      isDuplicate: false,
      captiveStatus: recognition.captiveStatus,
      sensitivity: recognition.sensitivity,
      qualityOk: true,
      isFirstDiscovery: true,
      streak: 1,
    };
    const score = rarityScoring.score(scoreInput);
    const card = buildCardMetadata(recognition, score);

    const { publicImageUri } = await cardGen.generateCard(card, recognition);
    expect(publicImageUri).toMatch(/^mock-card:\/\//);
    expect(publicImageUri).toContain(card.category);
    expect(publicImageUri).toContain(card.rarity);

    // Deterministic: same inputs → same URI
    const { publicImageUri: second } = await cardGen.generateCard(card, recognition);
    expect(second).toBe(publicImageUri);
  });

  it('protected species has hidden:true public location', () => {
    const point = { lat: 51.5074, lng: -0.1278 };
    const publicLoc = locationPrivacy.getPublicLocation(point, 'protected');
    expect(publicLoc.hidden).toBe(true);
    expect(publicLoc.precisionMeters).toBeGreaterThan(0);
  });

  it('captive animals produce safety notes on card', async () => {
    // Force a domestic recognition
    const domesticRecognition: RecognitionResult = {
      category: 'animal',
      commonName: 'Domestic Cat',
      scientificName: 'Felis catus',
      confidence: 0.97,
      captiveStatus: 'domestic',
      sensitivity: 'none',
    };
    const scoreInput = {
      recognition: domesticRecognition,
      confidence: domesticRecognition.confidence,
      isDuplicate: false,
      captiveStatus: domesticRecognition.captiveStatus,
      sensitivity: domesticRecognition.sensitivity,
      qualityOk: true,
      isFirstDiscovery: false,
      streak: 0,
    };
    const score = rarityScoring.score(scoreInput);
    const card = buildCardMetadata(domesticRecognition, score);
    expect(card.safetyNotes).toBeDefined();
    expect(card.safetyNotes!.length).toBeGreaterThan(0);
    expect(card.safetyNotes!.some(n => n.toLowerCase().includes('domestic'))).toBe(true);
  });

  it('full pipeline produces no error for any MOCK_URI variant', async () => {
    const uris = [
      'mock://a',
      'mock://b',
      'mock://capture/fox.jpg',
      'mock://capture/oak.jpg',
      'mock://capture/fly_agaric.jpg',
    ];
    for (const uri of uris) {
      const recognition = await vision.recognize(uri);
      const mod = await moderation.moderate(uri);
      if (!mod.allowed) continue; // skip moderation-blocked URIs
      const score = rarityScoring.score({
        recognition,
        confidence: recognition.confidence,
        isDuplicate: false,
        captiveStatus: recognition.captiveStatus,
        sensitivity: recognition.sensitivity,
        qualityOk: mod.qualityOk,
        isFirstDiscovery: true,
        streak: 0,
      });
      const card = buildCardMetadata(recognition, score);
      const { publicImageUri } = await cardGen.generateCard(card, recognition);
      expect(publicImageUri).toBeTruthy();
    }
  });
});
