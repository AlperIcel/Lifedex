/**
 * Resilience/routing tests for INatRecognitionProvider. The network client
 * (scoreImage) and the observation-count lookup are mocked; the real mapper runs
 * so this covers the integration of map + route + enrich + fallback. No network
 * happens.
 */
import type { RecognitionResult } from '@/domain/types';
import { fetchObservationsCount } from '@/lib/inatObservations';
import type { VisionRecognitionProvider } from '../../interfaces';
import { scoreImage } from '../inatClient';
import type { InatScoreResponse, InatTaxon } from '../inatMapping';
import { INatRecognitionProvider } from '../inatVision';

jest.mock('../inatClient', () => ({ scoreImage: jest.fn() }));
jest.mock('@/lib/inatObservations', () => ({ fetchObservationsCount: jest.fn() }));
const scoreImageMock = scoreImage as jest.MockedFunction<typeof scoreImage>;
const fetchCountMock = fetchObservationsCount as jest.MockedFunction<
  typeof fetchObservationsCount
>;

function inatResp(
  combined_score: number,
  name: string,
  iconic: string,
  taxonExtras: Partial<InatTaxon> = {},
): InatScoreResponse {
  return {
    total_results: 1,
    results: [
      {
        combined_score,
        taxon: { id: 1, name, rank: 'species', iconic_taxon_name: iconic, ...taxonExtras },
      },
    ],
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

/* ------------------------------------------------------------------ */
/* Observation count enrichment — the rarity signal                    */
/* ------------------------------------------------------------------ */

describe('INatRecognitionProvider — observationsCount', () => {
  it('looks the count up by taxon id and attaches it', async () => {
    scoreImageMock.mockResolvedValue(inatResp(90, 'Salamandra atra', 'Amphibia'));
    fetchCountMock.mockResolvedValue(3_200);
    const provider = new INatRecognitionProvider(OPTS);

    const r = await provider.recognize('file:///s.jpg');
    expect(fetchCountMock).toHaveBeenCalledWith(1); // the accepted taxon id
    expect(r.observationsCount).toBe(3_200);
  });

  it('skips the lookup when score_image already embedded the count', async () => {
    scoreImageMock.mockResolvedValue(
      inatResp(90, 'Salamandra atra', 'Amphibia', { observations_count: 3_200 }),
    );
    const provider = new INatRecognitionProvider(OPTS);

    const r = await provider.recognize('file:///s.jpg');
    expect(r.observationsCount).toBe(3_200);
    expect(fetchCountMock).not.toHaveBeenCalled();
  });

  it('still returns a usable result when the lookup fails (never blocks a catch)', async () => {
    scoreImageMock.mockResolvedValue(inatResp(90, 'Vulpes vulpes', 'Mammalia'));
    fetchCountMock.mockResolvedValue(undefined);
    const provider = new INatRecognitionProvider(OPTS);

    const r = await provider.recognize('file:///f.jpg');
    expect(r.scientificName).toBe('Vulpes vulpes');
    expect(r.observationsCount).toBeUndefined();
  });

  it('never lets a thrown lookup break recognition', async () => {
    scoreImageMock.mockResolvedValue(inatResp(90, 'Vulpes vulpes', 'Mammalia'));
    fetchCountMock.mockRejectedValue(new Error('boom'));
    const provider = new INatRecognitionProvider(OPTS);

    const r = await provider.recognize('file:///f.jpg');
    expect(r.scientificName).toBe('Vulpes vulpes');
    expect(r.observationsCount).toBeUndefined();
  });

  it('does NOT stamp the iNat count on a DIFFERENT species chosen by the refiner', async () => {
    // PlantNet overrode iNat's guess — we have no iNat taxon id for its species,
    // so claiming iNat's count for it would be a lie about rarity.
    scoreImageMock.mockResolvedValue(inatResp(60, 'Quercus robur', 'Plantae'));
    fetchCountMock.mockResolvedValue(155_000);
    const refiner = fakeRefiner(floraResult(0.9, 'Bellis perennis'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    const r = await provider.recognize('file:///p.jpg');
    expect(r.scientificName).toBe('Bellis perennis');
    expect(r.observationsCount).toBeUndefined();
    expect(fetchCountMock).not.toHaveBeenCalled();
  });

  it('still enriches when the iNat base survives the refiner', async () => {
    scoreImageMock.mockResolvedValue(inatResp(80, 'Quercus robur', 'Plantae'));
    fetchCountMock.mockResolvedValue(155_000);
    const refiner = fakeRefiner(floraResult(0.2, 'Weak guess'));
    const provider = new INatRecognitionProvider(OPTS, refiner);

    const r = await provider.recognize('file:///p.jpg');
    expect(r.scientificName).toBe('Quercus robur');
    expect(r.observationsCount).toBe(155_000);
  });

  it('does not look anything up for a NO_CATCH response', async () => {
    scoreImageMock.mockResolvedValue({ total_results: 0, results: [] });
    const provider = new INatRecognitionProvider(OPTS);

    const r = await provider.recognize('file:///nothing.jpg');
    expect(r.category).toBe('unknown');
    expect(fetchCountMock).not.toHaveBeenCalled();
  });
});
