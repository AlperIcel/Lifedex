/**
 * seededRotation — shared deterministic seed -> shuffle primitives.
 *
 * Lifted out of src/domain/dailyQuests.ts (which used these to rotate the daily
 * quest pool + pick Species-of-the-Day) so src/domain/lab.ts can reuse the EXACT
 * same seed -> shuffle machinery for its own weekly research-focus pick
 * (`labFocusForWeek`) instead of duplicating it. Both modules import from here;
 * neither redefines its own copy.
 *
 * Pure, deterministic, no I/O, no Date.now()/Math.random() — the caller always
 * supplies the seed (typically a hash of a day/week key). NOT cryptographic —
 * good enough to rotate a short UI list/pick, nothing more.
 */

/**
 * Deterministic 32-bit string hash (multiply-by-31, Java `String.hashCode`-style).
 * Not for security — just a seed.
 */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG seeded by a 32-bit integer. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic shuffle (sort-by-random-key / Schwartzian transform). Chosen
 * over an in-place Fisher-Yates swap because it needs no numeric array
 * indexing on the mutable buffer — simpler to keep safe under
 * `noUncheckedIndexedAccess`. Not uniform enough for cryptographic use; plenty
 * for picking/rotating a handful of items.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  return items
    .map((item) => ({ item, key: rand() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}
