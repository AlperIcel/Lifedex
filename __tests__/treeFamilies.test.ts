/**
 * Tests for the tree-vs-herb family heuristic (src/domain/treeFamilies.ts).
 *
 * Pure lookup — no network, no fixtures beyond plain strings.
 */
import { isTreeFamily, TREE_FAMILIES } from '@/domain/treeFamilies';

describe('isTreeFamily — known tree families', () => {
  it('accepts every family in the curated list', () => {
    for (const family of TREE_FAMILIES) {
      expect(isTreeFamily(family)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isTreeFamily('fagaceae')).toBe(true);
    expect(isTreeFamily('FAGACEAE')).toBe(true);
    expect(isTreeFamily('FaGaCeAe')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isTreeFamily('  Pinaceae ')).toBe(true);
    expect(isTreeFamily('\tOleaceae\n')).toBe(true);
  });
});

describe('isTreeFamily — non-tree families (herbs, animals, fungi)', () => {
  it('rejects herbaceous / too-mixed plant families', () => {
    expect(isTreeFamily('Rosaceae')).toBe(false); // deliberately excluded, see header
    expect(isTreeFamily('Malvaceae')).toBe(false); // deliberately excluded, see header
    expect(isTreeFamily('Asteraceae')).toBe(false); // daisies, dandelions
    expect(isTreeFamily('Poaceae')).toBe(false); // grasses
    expect(isTreeFamily('Lamiaceae')).toBe(false); // mints
  });

  it('rejects animal family names', () => {
    expect(isTreeFamily('Canidae')).toBe(false);
    expect(isTreeFamily('Corvidae')).toBe(false);
  });

  it('rejects fungus family names', () => {
    expect(isTreeFamily('Amanitaceae')).toBe(false);
  });
});

describe('isTreeFamily — empty/undefined input', () => {
  it('returns false for undefined', () => {
    expect(isTreeFamily(undefined)).toBe(false);
  });

  it('returns false for an empty or whitespace-only string', () => {
    expect(isTreeFamily('')).toBe(false);
    expect(isTreeFamily('   ')).toBe(false);
  });

  it('returns false for an unrecognised family', () => {
    expect(isTreeFamily('Nonexistentaceae')).toBe(false);
  });
});
