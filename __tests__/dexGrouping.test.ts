/**
 * Tests for buildDex (src/domain/dexGrouping.ts) — the pure "Living-Dex"
 * grouping logic behind CollectionScreen: caught catalogue species, locked
 * silhouette gaps, and uncatalogued "bonus" finds.
 */
import { buildDex, DEX_CATEGORIES, type DexSightingRow } from '../src/domain/dexGrouping';
import { SPECIES_RULES } from '../src/domain/speciesRules';
import type { Sighting } from '../src/domain/types';

let seq = 0;

/** Builds a minimally-valid Sighting; only the fields buildDex reads matter. */
function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    id: `s${seq}`,
    userId: 'user-1',
    createdAt: new Date().toISOString(),
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

/** Builds a DexSightingRow (cardId + sighting) — a row per CollectionScreen's CardRow shape. */
function makeRow(overrides: Partial<Sighting> = {}, cardId?: string): DexSightingRow {
  const sighting = makeSighting(overrides);
  return { cardId: cardId ?? `card-${sighting.id}`, sighting };
}

const animalCatalogueCount = SPECIES_RULES.filter((r) => r.category === 'animal').length;
const plantCatalogueCount = SPECIES_RULES.filter((r) => r.category === 'plant').length;
const treeCatalogueCount = SPECIES_RULES.filter((r) => r.category === 'tree').length;
const mushroomCatalogueCount = SPECIES_RULES.filter((r) => r.category === 'mushroom').length;

function section(dex: ReturnType<typeof buildDex>, category: string) {
  const found = dex.sections.find((s) => s.category === category);
  if (found === undefined) throw new Error(`section ${category} not found`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Structure / determinism                                            */
/* ------------------------------------------------------------------ */

describe('buildDex — structure', () => {
  it('DEX_CATEGORIES is the fixed four-category order', () => {
    expect(DEX_CATEGORIES).toEqual(['animal', 'plant', 'tree', 'mushroom']);
  });

  it('with an empty collection, every catalogue category is fully locked', () => {
    const dex = buildDex([]);
    expect(dex.sections.map((s) => s.category)).toEqual(['animal', 'plant', 'tree', 'mushroom']);

    const animal = section(dex, 'animal');
    expect(animal.caught).toBe(0);
    expect(animal.total).toBe(animalCatalogueCount);
    expect(animal.bonusCaught).toBe(0);
    expect(animal.entries).toHaveLength(animalCatalogueCount);
    expect(animal.entries.every((e) => e.kind === 'locked')).toBe(true);

    expect(dex.totalCaught).toBe(0);
    expect(dex.totalSpecies).toBe(SPECIES_RULES.length);
  });

  it('totalSpecies always equals SPECIES_RULES.length, regardless of what is caught', () => {
    const dex = buildDex([makeRow({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' })]);
    expect(dex.totalSpecies).toBe(SPECIES_RULES.length);
    const sum = animalCatalogueCount + plantCatalogueCount + treeCatalogueCount + mushroomCatalogueCount;
    expect(dex.totalSpecies).toBe(sum);
  });

  it('is deterministic: same input twice produces deep-equal output', () => {
    const rows = [
      makeRow({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' }),
      makeRow({ commonName: 'Ghost Orchid', scientificName: 'Epipogium aphyllum', category: 'plant' }),
    ];
    expect(buildDex(rows)).toEqual(buildDex(rows));
  });

  it('a locked entry carries its catalogue baseRarity as a rarity hint', () => {
    const dex = buildDex([]);
    const animal = section(dex, 'animal');
    const otter = animal.entries.find((e) => e.kind === 'locked' && e.commonName === 'European Otter');
    expect(otter).toBeDefined();
    if (otter?.kind === 'locked') {
      expect(otter.baseRarity).toBe('legendary');
      expect(otter.category).toBe('animal');
    }

    const catCatalogue = animal.entries.find(
      (e) => e.kind === 'locked' && e.commonName === 'Domestic Cat',
    );
    if (catCatalogue?.kind === 'locked') {
      expect(catCatalogue.baseRarity).toBe('common');
    }
  });
});

/* ------------------------------------------------------------------ */
/* Catching a catalogue species                                       */
/* ------------------------------------------------------------------ */

describe('buildDex — catching a catalogue species', () => {
  it('moves that species from locked to caught, decrementing nothing else', () => {
    const row = makeRow({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' }, 'card-fox');
    const dex = buildDex([row]);
    const animal = section(dex, 'animal');

    expect(animal.caught).toBe(1);
    expect(animal.total).toBe(animalCatalogueCount);

    const foxEntry = animal.entries.find((e) => e.kind === 'caught' && e.cardId === 'card-fox');
    expect(foxEntry).toBeDefined();
    if (foxEntry?.kind === 'caught') {
      expect(foxEntry.isBonus).toBe(false);
      expect(foxEntry.sighting.commonName).toBe('Red Fox');
    }

    // A different, still-uncaught animal is still locked.
    const owlEntry = animal.entries.find((e) => e.kind === 'locked' && e.commonName === 'Eagle Owl');
    expect(owlEntry).toBeDefined();

    expect(dex.totalCaught).toBe(1);
  });

  it('matches by scientific name even when the common name differs (e.g. localisation)', () => {
    const row = makeRow({ commonName: 'Renard roux', scientificName: 'Vulpes vulpes' });
    const dex = buildDex([row]);
    const animal = section(dex, 'animal');
    // Catalogue slot key is the CATALOGUE's canonical name, not the sighting's.
    const foxEntry = animal.entries.find(
      (e) => e.kind === 'caught' && e.sighting.commonName === 'Renard roux',
    );
    expect(foxEntry).toBeDefined();
    expect(animal.caught).toBe(1);
    // No stray extra locked slot was created for "Renard roux" — still exactly
    // the catalogue's count of entries.
    expect(animal.entries).toHaveLength(animalCatalogueCount);
  });

  it('catching the same species twice only counts once, keeping the FIRST (newest) row', () => {
    const newer = makeRow({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' }, 'card-new');
    const older = makeRow({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' }, 'card-old');

    const dexNewestFirst = buildDex([newer, older]);
    const animal1 = section(dexNewestFirst, 'animal');
    expect(animal1.caught).toBe(1);
    const kept1 = animal1.entries.find((e) => e.kind === 'caught' && e.sighting.commonName === 'Red Fox');
    expect(kept1?.kind === 'caught' && kept1.cardId).toBe('card-new');

    // Reversed input order keeps whichever row comes first — documents the
    // "rows must be newest-first" contract.
    const dexReversed = buildDex([older, newer]);
    const animal2 = section(dexReversed, 'animal');
    const kept2 = animal2.entries.find((e) => e.kind === 'caught' && e.sighting.commonName === 'Red Fox');
    expect(kept2?.kind === 'caught' && kept2.cardId).toBe('card-old');
  });

  it('catching every catalogued animal reaches exactly caught === total (100%, not more)', () => {
    const rows = SPECIES_RULES.filter((r) => r.category === 'animal').map((r) =>
      makeRow({ commonName: r.commonName, scientificName: r.scientificName, category: 'animal' }),
    );
    const dex = buildDex(rows);
    const animal = section(dex, 'animal');
    expect(animal.caught).toBe(animal.total);
    expect(animal.entries.every((e) => e.kind === 'caught')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Bonus finds (uncatalogued species)                                 */
/* ------------------------------------------------------------------ */

describe('buildDex — bonus finds', () => {
  it('shows an uncatalogued species in its category, marked isBonus, uncounted', () => {
    const row = makeRow({
      commonName: 'Ghost Orchid',
      scientificName: 'Epipogium aphyllum',
      category: 'plant',
    });
    const dex = buildDex([row]);
    const plant = section(dex, 'plant');

    expect(plant.caught).toBe(0); // catalogue completion untouched
    expect(plant.total).toBe(plantCatalogueCount);
    expect(plant.bonusCaught).toBe(1);

    const bonusEntry = plant.entries.find(
      (e) => e.kind === 'caught' && e.sighting.commonName === 'Ghost Orchid',
    );
    expect(bonusEntry).toBeDefined();
    if (bonusEntry?.kind === 'caught') {
      expect(bonusEntry.isBonus).toBe(true);
    }
    expect(dex.totalCaught).toBe(0);
  });

  it('bonus finds are appended AFTER the catalogue slots', () => {
    const rows = [
      makeRow({ commonName: 'Ghost Orchid', scientificName: 'Epipogium aphyllum', category: 'plant' }),
    ];
    const dex = buildDex(rows);
    const plant = section(dex, 'plant');
    expect(plant.entries).toHaveLength(plantCatalogueCount + 1);
    const lastEntry = plant.entries[plant.entries.length - 1];
    expect(lastEntry?.kind === 'caught' && lastEntry.isBonus).toBe(true);
  });

  it('THE FIX: catching many bonus species never pushes completion past 100%', () => {
    // Every catalogued animal PLUS five extra uncatalogued animals.
    const catalogueRows = SPECIES_RULES.filter((r) => r.category === 'animal').map((r) =>
      makeRow({ commonName: r.commonName, scientificName: r.scientificName, category: 'animal' }),
    );
    const bonusRows = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((n) =>
      makeRow({ commonName: n, scientificName: `Genus ${n.toLowerCase()}`, category: 'animal' }),
    );
    const dex = buildDex([...catalogueRows, ...bonusRows]);
    const animal = section(dex, 'animal');

    expect(animal.caught).toBe(animal.total); // exactly 100%, never more
    expect(animal.bonusCaught).toBe(5);
    // Only the animal category was fully caught; overall total reflects that
    // exactly (not inflated by the 5 bonus finds) and never exceeds the catalogue.
    expect(dex.totalCaught).toBe(animalCatalogueCount);
    expect(dex.totalCaught).toBeLessThanOrEqual(dex.totalSpecies);
  });

  it('dedupes bonus finds by identity (scientific name, case-insensitive)', () => {
    const rows = [
      makeRow({ commonName: 'Ghost Orchid', scientificName: 'Epipogium Aphyllum', category: 'plant' }),
      makeRow({ commonName: 'ghost orchid', scientificName: 'epipogium aphyllum', category: 'plant' }),
    ];
    const dex = buildDex(rows);
    const plant = section(dex, 'plant');
    expect(plant.bonusCaught).toBe(1);
  });

  it('dedupes bonus finds without a scientific name by common name (case-insensitive)', () => {
    const rows = [
      makeRow({ commonName: 'Mystery Weed', scientificName: undefined, category: 'plant' }),
      makeRow({ commonName: 'mystery weed', scientificName: undefined, category: 'plant' }),
    ];
    const dex = buildDex(rows);
    const plant = section(dex, 'plant');
    expect(plant.bonusCaught).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* The 'unknown' bonus-only bucket                                     */
/* ------------------------------------------------------------------ */

describe("buildDex — the 'unknown' bucket", () => {
  it('is omitted entirely when no sighting has category unknown', () => {
    const dex = buildDex([makeRow({ commonName: 'Red Fox', scientificName: 'Vulpes vulpes' })]);
    expect(dex.sections.some((s) => s.category === 'unknown')).toBe(false);
  });

  it('appears, bonus-only, when a caught sighting could not be categorised', () => {
    const row = makeRow({ commonName: 'Mystery Thing', scientificName: undefined, category: 'unknown' });
    const dex = buildDex([row]);
    const unknown = section(dex, 'unknown');

    expect(unknown.total).toBe(0);
    expect(unknown.caught).toBe(0);
    expect(unknown.bonusCaught).toBe(1);
    expect(unknown.entries).toHaveLength(1);
    expect(unknown.entries[0]?.kind === 'caught' && unknown.entries[0].isBonus).toBe(true);

    // It never inflates the overall (catalogue-only) totals.
    expect(dex.totalCaught).toBe(0);
    expect(dex.totalSpecies).toBe(SPECIES_RULES.length);
  });

  it('a category:"unknown" sighting that STILL matches a catalogue name is filed under the real category, not "unknown"', () => {
    // Recogniser gave up on category but still returned a known name/sci-name.
    const row = makeRow({ commonName: 'Eagle Owl', scientificName: 'Bubo bubo', category: 'unknown' });
    const dex = buildDex([row]);

    expect(dex.sections.some((s) => s.category === 'unknown')).toBe(false);
    const animal = section(dex, 'animal');
    const owlEntry = animal.entries.find((e) => e.kind === 'caught' && e.sighting.commonName === 'Eagle Owl');
    expect(owlEntry).toBeDefined();
    if (owlEntry?.kind === 'caught') expect(owlEntry.isBonus).toBe(false);
  });
});
