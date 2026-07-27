/**
 * Resilience/routing tests for INatRecognitionProvider. The network client
 * (scoreImage) is mocked; the real mapper runs so this covers the integration
 * of map + route + fallback. No network happens.
 */
import type { RecognitionResult } from '@/domain/types';
import type { VisionRecognitionProvider } from '../../interfaces';
import { scoreImage } from '../inatClient';
import type { InatScoreResponse } from '../inatMapping';
import { INatRecognitionProvider } from '../inatVision';

jest.mock('../inatClient', () => ({ scoreImage: jest.fn() }));
const scoreImageMock = scoreImage as jest.MockedFunction<typeof scoreImage>;

function inatResp(
  combined_score: number,
  name: string,
  iconic: string,
): InatScoreResponse {
  return {
    total_results: 1,
    results: [{ combined_score, taxon: { id: 1, name, rank: 'species', iconic_taxon_name: iconic } }],
  };
}

function fakeRefiner(result: RecognitionResult): VisionRecognitionProvider & {
  recognize: jest.Mock;
} {
  return { recognize: jest.fn().mockResolvedValue(result) };
}

function floraResult(confidence: number, scientificName: string): RecognitionResult {
  return {
    category: 'plant',
    commonName: scientificName,
    scientificName,
    confidence,
    captiveStatus: 'wild',
    sensitivity: 'none',
  };
}

const OPTS = { apiToken: 't' };

afterEach(() => jest.clearAllMocks());

describe('INatRecognitionProvider', () => {
  it('returns the iNat base and does NOT consult the refiner for an animal', async () => {
    scoreImageMock.mockResolvedValue(inatResp(90, 'Vulpes vulpes', 'Mammalia'));
    const refiner = fakeRefiner(floraResult(0.99, 'Should not be used'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    const r = await provider.recognize('file:///a.jpg');
    expect(r.category).toBe('animal');
    expect(r.scientificName).toBe('Vulpes vulpes');
    expect(refiner.recognize).not.toHaveBeenCalled();
  });

  it('prefers the more-confident refiner when the base is flora', async () => {
    scoreImageMock.mockResolvedValue(inatResp(60, 'Quercus robur', 'Plantae'));
    const refiner = fakeRefiner(floraResult(0.9, 'Bellis perennis'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    const r = await provider.recognize('file:///p.jpg');
    expect(refiner.recognize).toHaveBeenCalled();
    expect(r.scientificName).toBe('Bellis perennis'); // 0.90 > 0.60
  });

  it('keeps the iNat base when the flora refiner is less confident', async () => {
    scoreImageMock.mockResolvedValue(inatResp(80, 'Quercus robur', 'Plantae'));
    const refiner = fakeRefiner(floraResult(0.2, 'Weak guess'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    const r = await provider.recognize('file:///p.jpg');
    expect(r.scientificName).toBe('Quercus robur'); // 0.80 > 0.20
  });

  it('falls back to the refiner ONLY when it is confident this is a plant', async () => {
    scoreImageMock.mockRejectedValue(new Error('iNat down'));
    const refiner = fakeRefiner(floraResult(0.8, 'Bellis perennis'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    const r = await provider.recognize('file:///x.jpg');
    expect(r.scientificName).toBe('Bellis perennis');
  });

  it('re-throws the original iNat error when the refiner is not confident', async () => {
    scoreImageMock.mockRejectedValue(new Error('iNat down'));
    const refiner = fakeRefiner(floraResult(0.3, 'Nearest plant'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    await expect(provider.recognize('file:///animal.jpg')).rejects.toThrow('iNat down');
  });

  it('re-throws when iNat fails and there is no refiner', async () => {
    scoreImageMock.mockRejectedValue(new Error('iNat down'));
    const provider = new INatRecognitionProvider(OPTS);

    await expect(provider.recognize('file:///x.jpg')).rejects.toThrow('iNat down');
  });
});
