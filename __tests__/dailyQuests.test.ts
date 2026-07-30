/**
 * Tests for the daily-loop domain module (src/domain/dailyQuests.ts) — pure, no I/O.
 */
import {
  dayKeyOf,
  selectQuestIdsForDay,
  computeDailyQuest,
  dailyQuestsFor,
  speciesOfTheDay,
  DAILY_QUEST_IDS,
  DAILY_REWARD_XP,
  QUESTS_PER_DAY,
  type DailyQuestId,
} from '../src/domain/dailyQuests';
import { SPECIES_RULES } from '../src/domain/speciesRules';
import { CategorySchema, RaritySchema } from '../src/domain/types';
import type { Category, Sighting } from '../src/domain/types';

let seq = 0;

/** Builds a minimally-valid Sighting; only the fields dailyQuests.ts reads matter. */
function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    id: `s${seq}`,
    userId: 'user-1',
    createdAt: '2026-03-15T12:00:00.000Z',
    category: 'animal',
    commonName: `Species ${seq}`,
    scientificName: undefined,
    confidence: 0.9,
    rarity: 'common',
    xp: 10,
    captiveStatus: 'wild',
    sensitivity: 'none',
    privatePhotoUri: 'file:///private/x.jpg',
    publicImageUri: 'mock-card://animal',
    publicLocation: { lat: 0, lng: 0, precisionMeters: 100, hidden: false },
    card: { name: `Species ${seq}`, category: 'animal', rarity: 'common', xp: 10, description: 'x', stats: {} },
    moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
    ...overrides,
  };
}

const DAY = '2026-03-15';
const OTHER_DAY = '2026-03-16';

/** A sighting timestamped at noon UTC on `dayKey`. */
function at(dayKey: string, overrides: Partial<Sighting> = {}): Sighting {
  return makeSighting({ createdAt: `${dayKey}T12:00:00.000Z`, ...overrides });
}

/* ------------------------------------------------------------------ */
/* dayKeyOf                                                            */
/* ------------------------------------------------------------------ */

describe('dayKeyOf', () => {
  it('extracts the UTC YYYY-MM-DD date from an ISO timestamp', () => {
    expect(dayKeyOf('2026-03-15T23:59:59.999Z')).toBe('2026-03-15');
    expect(dayKeyOf('2026-03-15T00:00:00.000Z')).toBe('2026-03-15');
  });

  it('is stable for any time within the same UTC day', () => {
    expect(dayKeyOf('2026-03-15T00:00:00.000Z')).toBe(dayKeyOf('2026-03-15T23:59:59.000Z'));
  });

  it('differs across a UTC day boundary', () => {
    expect(dayKeyOf('2026-03-15T23:59:59.999Z')).not.toBe(dayKeyOf('2026-03-16T00:00:00.000Z'));
  });

  it('never throws, even on unparseable input', () => {
    expect(() => dayKeyOf('not-a-date')).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* selectQuestIdsForDay — selection determinism/shape                  */
/* ------------------------------------------------------------------ */

describe('selectQuestIdsForDay', () => {
  it(`returns exactly ${QUESTS_PER_DAY} quest ids`, () => {
    expect(selectQuestIdsForDay(DAY)).toHaveLength(QUESTS_PER_DAY);
  });

  it('returns distinct ids, each from the known pool', () => {
    const ids = selectQuestIdsForDay(DAY);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(DAILY_QUEST_IDS).toContain(id);
    }
  });

  it('is deterministic for the same dayKey', () => {
    expect(selectQuestIdsForDay(DAY)).toEqual(selectQuestIdsForDay(DAY));
  });

  it('varies across different days (not always the same 3)', () => {
    const combos = new Set<string>();
    for (let m = 1; m <= 12; m++) {
      for (const day of [1, 10, 20]) {
        const key = `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        combos.add([...selectQuestIdsForDay(key)].sort().join(','));
      }
    }
    expect(combos.size).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ */
/* computeDailyQuest — per-quest counting logic (selection-agnostic)    */
/* ------------------------------------------------------------------ */

describe('computeDailyQuest — species-3', () => {
  it('counts distinct species (scientificName ?? commonName), not total finds', () => {
    const today = [
      at(DAY, { commonName: 'Robin', scientificName: 'Erithacus rubecula' }),
      at(DAY, { commonName: 'Robin', scientificName: 'Erithacus rubecula' }), // duplicate species
      at(DAY, { commonName: 'Fox', scientificName: 'Vulpes vulpes' }),
    ];
    const q = computeDailyQuest('species-3', today);
    expect(q.target).toBe(3);
    expect(q.current).toBe(2);
    expect(q.done).toBe(false);
  });

  it('unlocks at 3 distinct species and clamps current above target', () => {
    const today = [
      at(DAY, { commonName: 'A' }),
      at(DAY, { commonName: 'B' }),
      at(DAY, { commonName: 'C' }),
      at(DAY, { commonName: 'D' }),
    ];
    const q = computeDailyQuest('species-3', today);
    expect(q.done).toBe(true);
    expect(q.current).toBe(3); // clamped, not 4
  });
});

describe('computeDailyQuest — category quests', () => {
  const CASES: { id: DailyQuestId; category: Category }[] = [
    { id: 'category-animal', category: 'animal' },
    { id: 'category-plant', category: 'plant' },
    { id: 'category-tree', category: 'tree' },
    { id: 'category-mushroom', category: 'mushroom' },
  ];

  for (const { id, category } of CASES) {
    it(`${id}: only counts category === '${category}'`, () => {
      const other: Category = category === 'animal' ? 'plant' : 'animal';

      const zero = computeDailyQuest(id, [at(DAY, { category: other })]);
      expect(zero.current).toBe(0);
      expect(zero.done).toBe(false);

      const one = computeDailyQuest(id, [at(DAY, { category: other }), at(DAY, { category })]);
      expect(one.current).toBe(1);
      expect(one.done).toBe(true);
    });
  }
});

describe('computeDailyQuest — rare-or-new', () => {
  it('does not count a common, non-first-discovery sighting', () => {
    const q = computeDailyQuest('rare-or-new', [
      at(DAY, { rarity: 'common', isFirstDiscovery: false }),
    ]);
    expect(q.current).toBe(0);
    expect(q.done).toBe(false);
  });

  it('counts a rare-or-better sighting even without a first discovery', () => {
    const q = computeDailyQuest('rare-or-new', [
      at(DAY, { rarity: 'rare', isFirstDiscovery: false }),
    ]);
    expect(q.done).toBe(true);
  });

  it('counts a common first-discovery sighting too (OR, not AND)', () => {
    const q = computeDailyQuest('rare-or-new', [
      at(DAY, { rarity: 'common', isFirstDiscovery: true }),
    ]);
    expect(q.done).toBe(true);
  });
});

describe('computeDailyQuest — volume-5', () => {
  it('counts total sightings today regardless of species/category', () => {
    const today = Array.from({ length: 4 }, (_, i) => at(DAY, { commonName: `S${i}` }));
    const q = computeDailyQuest('volume-5', today);
    expect(q.current).toBe(4);
    expect(q.done).toBe(false);
  });

  it('unlocks at 5 and clamps current above target', () => {
    const today = Array.from({ length: 8 }, (_, i) => at(DAY, { commonName: `S${i}` }));
    const q = computeDailyQuest('volume-5', today);
    expect(q.done).toBe(true);
    expect(q.current).toBe(5);
  });
});

describe('computeDailyQuest — wild-1', () => {
  it('only counts captiveStatus === "wild"', () => {
    const zero = computeDailyQuest('wild-1', [
      at(DAY, { captiveStatus: 'domestic' }),
      at(DAY, { captiveStatus: 'zoo_captive' }),
    ]);
    expect(zero.current).toBe(0);
    expect(zero.done).toBe(false);

    const one = computeDailyQuest('wild-1', [
      at(DAY, { captiveStatus: 'domestic' }),
      at(DAY, { captiveStatus: 'wild' }),
    ]);
    expect(one.done).toBe(true);
  });
});

describe('computeDailyQuest — shape invariants (all pool ids)', () => {
  it('every quest locks at zero progress with no sightings', () => {
    for (const id of DAILY_QUEST_IDS) {
      const q = computeDailyQuest(id, []);
      expect(q.target).toBeGreaterThan(0);
      expect(q.current).toBe(0);
      expect(q.done).toBe(false);
    }
  });

  it('every quest caps current at target even with excess matching sightings', () => {
    const bigToday: Sighting[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        at(DAY, {
          commonName: `Z${i}`,
          category: 'animal',
          rarity: 'legendary',
          isFirstDiscovery: true,
          captiveStatus: 'wild',
        }),
      ),
      at(DAY, { category: 'plant', captiveStatus: 'wild' }),
      at(DAY, { category: 'tree', captiveStatus: 'wild' }),
      at(DAY, { category: 'mushroom', captiveStatus: 'wild' }),
    ];
    for (const id of DAILY_QUEST_IDS) {
      const q = computeDailyQuest(id, bigToday);
      expect(q.current).toBeLessThanOrEqual(q.target);
      expect(q.done).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* dailyQuestsFor — integration (selection-agnostic invariants)         */
/* ------------------------------------------------------------------ */

describe('dailyQuestsFor', () => {
  it(`returns exactly ${QUESTS_PER_DAY} quests matching selectQuestIdsForDay for that dayKey`, () => {
    const quests = dailyQuestsFor(DAY, []);
    expect(quests.map((q) => q.id)).toEqual(selectQuestIdsForDay(DAY));
  });

  it('with no sightings, every quest is at 0 progress and not done', () => {
    const quests = dailyQuestsFor(DAY, []);
    for (const q of quests) {
      expect(q.current).toBe(0);
      expect(q.done).toBe(false);
    }
  });

  it('ignores sightings from a different day entirely', () => {
    // Enough volume/variety on OTHER_DAY to satisfy every pool quest if the
    // day-filter were broken — every returned quest must still read 0.
    const otherDaySightings: Sighting[] = [
      at(OTHER_DAY, {
        category: 'animal',
        rarity: 'legendary',
        isFirstDiscovery: true,
        captiveStatus: 'wild',
        commonName: 'A',
      }),
      at(OTHER_DAY, { category: 'plant', captiveStatus: 'wild', commonName: 'B' }),
      at(OTHER_DAY, { category: 'tree', captiveStatus: 'wild', commonName: 'C' }),
      at(OTHER_DAY, { category: 'mushroom', captiveStatus: 'wild', commonName: 'D' }),
      at(OTHER_DAY, { category: 'animal', captiveStatus: 'wild', commonName: 'E' }),
    ];
    const quests = dailyQuestsFor(DAY, otherDaySightings);
    for (const q of quests) {
      expect(q.current).toBe(0);
      expect(q.done).toBe(false);
    }
  });

  it('a today-set covering every pool quest completes all 3, whichever were selected', () => {
    const today: Sighting[] = [
      at(DAY, {
        category: 'animal',
        rarity: 'legendary',
        isFirstDiscovery: true,
        captiveStatus: 'wild',
        commonName: 'A',
      }),
      at(DAY, { category: 'plant', captiveStatus: 'wild', commonName: 'B' }),
      at(DAY, { category: 'tree', captiveStatus: 'wild', commonName: 'C' }),
      at(DAY, { category: 'mushroom', captiveStatus: 'wild', commonName: 'D' }),
      at(DAY, { category: 'animal', captiveStatus: 'wild', commonName: 'E' }),
    ];
    const quests = dailyQuestsFor(DAY, today);
    expect(quests).toHaveLength(QUESTS_PER_DAY);
    for (const q of quests) {
      expect(q.done).toBe(true);
    }
  });

  it('is deterministic: same dayKey + sightings produce the same output', () => {
    const sightings = [at(DAY, { commonName: 'X' }), at(DAY, { commonName: 'Y' })];
    expect(dailyQuestsFor(DAY, sightings)).toEqual(dailyQuestsFor(DAY, sightings));
  });
});

/* ------------------------------------------------------------------ */
/* speciesOfTheDay                                                      */
/* ------------------------------------------------------------------ */

describe('speciesOfTheDay', () => {
  it('is deterministic for the same dayKey', () => {
    expect(speciesOfTheDay(DAY)).toEqual(speciesOfTheDay(DAY));
  });

  it('returns a real catalogue entry (name + matching scientificName, rarity, category)', () => {
    const pick = speciesOfTheDay(DAY);
    const match = SPECIES_RULES.find((r) => r.commonName === pick.name);
    expect(match).toBeDefined();
    expect(pick.scientificName).toBe(match?.scientificName);
    expect(pick.rarity).toBe(match?.baseRarity);
    expect(pick.category).toBe(match?.category);
  });

  it('always carries a present and valid rarity + category (SpeciesOfDayScreen renders both)', () => {
    for (let m = 1; m <= 12; m++) {
      for (const day of [1, 10, 20]) {
        const key = `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const pick = speciesOfTheDay(key);
        expect(pick.rarity).toBeDefined();
        expect(RaritySchema.safeParse(pick.rarity).success).toBe(true);
        expect(pick.category).toBeDefined();
        expect(CategorySchema.safeParse(pick.category).success).toBe(true);
      }
    }
  });

  it('varies across different days (not always the same species)', () => {
    const names = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      names.add(speciesOfTheDay(`2026-01-${String(d).padStart(2, '0')}`).name);
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it('never picks a domestic species — the spotlight should send you outside, not name your own pet', () => {
    // Also guards a real HomeScreen bug: the seeded mock's freshest sighting
    // IS 'Domestic Cat', so picking it here would duplicate that exact text
    // elsewhere on Home and break a getByText/queryByText assertion.
    for (let m = 1; m <= 12; m++) {
      for (const day of [1, 8, 15, 22]) {
        const key = `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const name = speciesOfTheDay(key).name;
        expect(name).not.toBe('Domestic Cat');
        expect(name).not.toBe('Domestic Dog');
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Reward / pool constants sanity                                       */
/* ------------------------------------------------------------------ */

describe('constants', () => {
  it('DAILY_REWARD_XP is a small positive flat bonus', () => {
    expect(DAILY_REWARD_XP).toBeGreaterThan(0);
    expect(Number.isInteger(DAILY_REWARD_XP)).toBe(true);
  });

  it('the quest pool has more entries than QUESTS_PER_DAY (so selection is meaningful)', () => {
    expect(DAILY_QUEST_IDS.length).toBeGreaterThan(QUESTS_PER_DAY);
  });
});
