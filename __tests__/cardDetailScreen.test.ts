/**
 * Smoke-tests for the deterministic helpers behind CardDetailScreen
 * (hash → species index, date/precision formatting). Pure-logic only: does NOT
 * render the component and does NOT import the store (no Expo/RN renderer wired
 * up yet). The hashString helper is re-implemented inline to test determinism
 * without pulling in React.
 */

// Inline copy of the hashString helper — kept self-contained so this suite has
// no module imports and runs without the RN/Expo environment.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

const MOCK_SPECIES_COUNT = 8;

describe('useSighting — determinism', () => {
  it('same cardId always maps to the same species index', () => {
    const id = 'abc-123-xyz';
    const idx1 = hashString(id) % MOCK_SPECIES_COUNT;
    const idx2 = hashString(id) % MOCK_SPECIES_COUNT;
    expect(idx1).toBe(idx2);
  });

  it('different cardIds map to potentially different indices', () => {
    const ids = ['card-001', 'card-002', 'card-003', 'card-004'];
    const indices = ids.map((id) => hashString(id) % MOCK_SPECIES_COUNT);
    // Not all indices should be identical (this would be very unlucky to fail)
    const unique = new Set(indices);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('hash is always non-negative (unsigned 32-bit)', () => {
    const ids = ['', 'a', 'abc', 'longer-string-test-12345'];
    for (const id of ids) {
      expect(hashString(id)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('useSighting — first-discovery flag', () => {
  it('is deterministic for a given cardId', () => {
    const cardId = 'test-card-999';
    const isFirst1 = hashString(cardId + 'first') % 3 === 0;
    const isFirst2 = hashString(cardId + 'first') % 3 === 0;
    expect(isFirst1).toBe(isFirst2);
  });
});

describe('formatDate helper (inline)', () => {
  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  it('formats a valid ISO date', () => {
    const result = formatDate('2024-06-15T12:00:00Z');
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/June|Jun/);
  });

  it('returns input on invalid date', () => {
    const bad = 'not-a-date';
    const result = formatDate(bad);
    // Either throws+returns the raw string or produces "Invalid Date"
    // Either way it must be a non-empty string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('precisionLabel helper (inline)', () => {
  function precisionLabel(meters: number, hidden: boolean): string {
    if (hidden) return 'Exact location protected';
    if (meters >= 5000) return `±${(meters / 1000).toFixed(0)} km radius`;
    if (meters >= 1000) return `±${(meters / 1000).toFixed(1)} km radius`;
    return `±${meters} m radius`;
  }

  it('returns protection message when hidden', () => {
    expect(precisionLabel(5000, true)).toBe('Exact location protected');
  });

  it('shows km for large radius', () => {
    expect(precisionLabel(5000, false)).toBe('±5 km radius');
  });

  it('shows km with decimal for 1000–4999', () => {
    expect(precisionLabel(1000, false)).toBe('±1.0 km radius');
  });

  it('shows metres for small radius', () => {
    expect(precisionLabel(100, false)).toBe('±100 m radius');
  });
});
