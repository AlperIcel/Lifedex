import { buildCardMetadata } from '../src/domain/cardMetadata';
import type { RecognitionResult, ScoreResult } from '../src/domain/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const wildCommon: RecognitionResult = {
  category: 'animal',
  commonName: 'Common Sparrow',
  scientificName: 'Passer domesticus',
  confidence: 0.92,
  captiveStatus: 'wild',
  sensitivity: 'none',
};

const wildProtected: RecognitionResult = {
  category: 'animal',
  commonName: 'Golden Eagle',
  scientificName: 'Aquila chrysaetos',
  confidence: 0.88,
  captiveStatus: 'wild',
  sensitivity: 'protected',
};

const zooCaptive: RecognitionResult = {
  category: 'animal',
  commonName: 'Bengal Tiger',
  scientificName: 'Panthera tigris tigris',
  confidence: 0.95,
  captiveStatus: 'zoo_captive',
  sensitivity: 'none',
};

const sensitiveWild: RecognitionResult = {
  category: 'plant',
  commonName: 'Lady Slipper Orchid',
  scientificName: 'Cypripedium calceolus',
  confidence: 0.75,
  captiveStatus: 'wild',
  sensitivity: 'sensitive',
};

const scoreCommon: ScoreResult = { xp: 10, rarity: 'common', reason: 'Standard sighting' };
const scoreLegendary: ScoreResult = { xp: 500, rarity: 'legendary', reason: 'First discovery' };
const scoreRare: ScoreResult = { xp: 80, rarity: 'rare', reason: 'Rare species' };
const scoreEpic: ScoreResult = { xp: 200, rarity: 'epic', reason: 'Protected species bonus' };

/* ------------------------------------------------------------------ */
/* name / rarity / xp passthrough                                     */
/* ------------------------------------------------------------------ */

describe('buildCardMetadata — core fields', () => {
  it('passes name through from commonName', () => {
    const card = buildCardMetadata(wildCommon, scoreCommon);
    expect(card.name).toBe('Common Sparrow');
  });

  it('passes rarity from ScoreResult', () => {
    const card = buildCardMetadata(wildCommon, scoreLegendary);
    expect(card.rarity).toBe('legendary');
  });

  it('passes xp from ScoreResult', () => {
    const card = buildCardMetadata(wildCommon, scoreCommon);
    expect(card.xp).toBe(10);
  });

  it('passes category from RecognitionResult', () => {
    const card = buildCardMetadata(sensitiveWild, scoreRare);
    expect(card.category).toBe('plant');
  });

  it('rounds confidence to whole-number percentage in stats', () => {
    const card = buildCardMetadata(wildCommon, scoreCommon);
    expect(card.stats['confidence%']).toBe(92);
  });

  it('marks stats.rarity equal to score rarity', () => {
    const card = buildCardMetadata(wildCommon, scoreEpic);
    expect(card.stats['rarity']).toBe('epic');
  });

  it('stats.captive is No for wild animals', () => {
    const card = buildCardMetadata(wildCommon, scoreCommon);
    expect(card.stats['captive']).toBe('No');
  });

  it('stats.captive is Yes for zoo_captive animals', () => {
    const card = buildCardMetadata(zooCaptive, scoreCommon);
    expect(card.stats['captive']).toBe('Yes');
  });
});

/* ------------------------------------------------------------------ */
/* description                                                        */
/* ------------------------------------------------------------------ */

describe('buildCardMetadata — description', () => {
  it('includes the common name', () => {
    const card = buildCardMetadata(wildCommon, scoreCommon);
    expect(card.description).toContain('Common Sparrow');
  });

  it('includes the scientific name when present', () => {
    const card = buildCardMetadata(wildProtected, scoreEpic);
    expect(card.description).toContain('Aquila chrysaetos');
  });

  it('does not crash when scientificName is absent', () => {
    const noSci: RecognitionResult = { ...wildCommon, scientificName: undefined };
    const card = buildCardMetadata(noSci, scoreCommon);
    expect(card.description).toContain('Common Sparrow');
    expect(card.description).not.toContain('undefined');
  });

  it('uses legendary wording for legendary rarity', () => {
    const card = buildCardMetadata(wildCommon, scoreLegendary);
    expect(card.description).toMatch(/legendary/i);
  });

  it('uses epic wording for epic rarity', () => {
    const card = buildCardMetadata(wildCommon, scoreEpic);
    expect(card.description).toMatch(/epic/i);
  });

  it('uses rare wording for rare rarity', () => {
    const card = buildCardMetadata(wildCommon, scoreRare);
    expect(card.description).toMatch(/rare/i);
  });
});

/* ------------------------------------------------------------------ */
/* safetyNotes — presence rules                                       */
/* ------------------------------------------------------------------ */

describe('buildCardMetadata — safetyNotes', () => {
  it('safetyNotes is ABSENT for common wild species (sensitivity=none, wild)', () => {
    const card = buildCardMetadata(wildCommon, scoreCommon);
    expect(card.safetyNotes).toBeUndefined();
  });

  it('safetyNotes is PRESENT for protected species', () => {
    const card = buildCardMetadata(wildProtected, scoreEpic);
    expect(card.safetyNotes).toBeDefined();
    expect(Array.isArray(card.safetyNotes)).toBe(true);
    expect((card.safetyNotes as string[]).length).toBeGreaterThan(0);
  });

  it('protected safetyNote mentions legal protection', () => {
    const card = buildCardMetadata(wildProtected, scoreEpic);
    const notes = card.safetyNotes as string[];
    const hasLegalNote = notes.some(n => /protected/i.test(n) || /legally/i.test(n));
    expect(hasLegalNote).toBe(true);
  });

  it('safetyNotes is PRESENT for zoo/captive animals', () => {
    const card = buildCardMetadata(zooCaptive, scoreCommon);
    expect(card.safetyNotes).toBeDefined();
    expect((card.safetyNotes as string[]).length).toBeGreaterThan(0);
  });

  it('zoo safetyNote mentions captive/XP', () => {
    const card = buildCardMetadata(zooCaptive, scoreCommon);
    const notes = card.safetyNotes as string[];
    const hasCaptiveNote = notes.some(n => /captive/i.test(n) || /xp/i.test(n));
    expect(hasCaptiveNote).toBe(true);
  });

  it('safetyNotes is PRESENT for sensitive wild plants', () => {
    const card = buildCardMetadata(sensitiveWild, scoreRare);
    expect(card.safetyNotes).toBeDefined();
    expect((card.safetyNotes as string[]).length).toBeGreaterThan(0);
  });

  it('protected + zoo_captive both have two safety notes', () => {
    const combined: RecognitionResult = {
      ...zooCaptive,
      sensitivity: 'protected',
    };
    const card = buildCardMetadata(combined, scoreEpic);
    // Should have the protected note AND the zoo note
    expect((card.safetyNotes as string[]).length).toBe(2);
  });
});
