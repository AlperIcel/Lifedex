/**
 * id — small, dependency-free id helpers for LifeDex runtime code.
 *
 * `newId(prefix)` produces a unique-enough id for in-memory session state.
 * It uses a monotonic counter combined with the current time so two calls in
 * the same millisecond never collide. This is app-runtime code, not the
 * deterministic-mock pipeline, so a normal timestamp+counter id is fine.
 *
 * `hashString` is the shared djb2 variant used across the mock providers so the
 * pipeline can derive deterministic ids from an image URI when desired.
 */

let counter = 0;

/** Returns a unique session id, e.g. `sighting-l8f3k2-0`. */
export function newId(prefix = 'id'): string {
  counter += 1;
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${counter.toString(36)}`;
}

/** djb2-style hash — deterministic, no deps. Returns a non-negative integer. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  // Force to unsigned 32-bit so callers never see a negative value.
  return h >>> 0;
}
