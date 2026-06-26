import { decideModeration, MIN_QUALITY_SCORE, DetectorSignals } from '@/domain/moderation';

/** Helper: merge partial signals over a clean baseline. */
function signals(overrides: Partial<DetectorSignals> = {}): DetectorSignals {
  return {
    hasPerson: false,
    hasFace: false,
    hasLicensePlate: false,
    hasHouseNumber: false,
    isPrivateInterior: false,
    qualityScore: 0.9,
    ...overrides,
  };
}

describe('decideModeration', () => {
  /* ---------------------------------------------------------------- */
  /* Hard blocks                                                       */
  /* ---------------------------------------------------------------- */

  describe('person detection', () => {
    it('blocks when a human body is visible (no face)', () => {
      const result = decideModeration(signals({ hasPerson: true }));
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => /human body/i.test(r))).toBe(true);
    });

    it('blocks when a face is visible', () => {
      const result = decideModeration(signals({ hasFace: true }));
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => /face/i.test(r))).toBe(true);
    });

    it('blocks when both person and face are visible (only one reason per concept)', () => {
      const result = decideModeration(signals({ hasPerson: true, hasFace: true }));
      expect(result.allowed).toBe(false);
      // Face reason must appear; body-only reason must NOT be duplicated
      expect(result.reasons.some((r) => /face/i.test(r))).toBe(true);
      // Should not mention "human body" when face already covers it
      expect(result.reasons.filter((r) => /human body/i.test(r)).length).toBe(0);
    });
  });

  describe('license plate detection', () => {
    it('blocks when a license plate is visible', () => {
      const result = decideModeration(signals({ hasLicensePlate: true }));
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => /license plate/i.test(r))).toBe(true);
    });

    it('adds license_plate to strippedRegions', () => {
      const result = decideModeration(signals({ hasLicensePlate: true }));
      expect(result.strippedRegions).toContain('license_plate');
    });
  });

  /* ---------------------------------------------------------------- */
  /* Soft flags (allowed, but reasons populated)                       */
  /* ---------------------------------------------------------------- */

  describe('house number detection', () => {
    it('does NOT block but flags the reason', () => {
      const result = decideModeration(signals({ hasHouseNumber: true }));
      expect(result.allowed).toBe(true);
      expect(result.reasons.some((r) => /house number/i.test(r))).toBe(true);
    });

    it('adds house_number to strippedRegions', () => {
      const result = decideModeration(signals({ hasHouseNumber: true }));
      expect(result.strippedRegions).toContain('house_number');
    });
  });

  describe('private interior detection', () => {
    it('does NOT block but flags the reason', () => {
      const result = decideModeration(signals({ isPrivateInterior: true }));
      expect(result.allowed).toBe(true);
      expect(result.reasons.some((r) => /private interior/i.test(r))).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Quality gate                                                      */
  /* ---------------------------------------------------------------- */

  describe('quality score', () => {
    it('rejects photos below MIN_QUALITY_SCORE', () => {
      const score = MIN_QUALITY_SCORE - 0.01;
      const result = decideModeration(signals({ qualityScore: score }));
      expect(result.qualityOk).toBe(false);
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => /quality/i.test(r))).toBe(true);
    });

    it('accepts photos exactly at MIN_QUALITY_SCORE', () => {
      const result = decideModeration(signals({ qualityScore: MIN_QUALITY_SCORE }));
      expect(result.qualityOk).toBe(true);
      expect(result.allowed).toBe(true);
    });

    it('accepts photos above MIN_QUALITY_SCORE', () => {
      const result = decideModeration(signals({ qualityScore: 0.95 }));
      expect(result.qualityOk).toBe(true);
      expect(result.allowed).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Clean photo                                                       */
  /* ---------------------------------------------------------------- */

  describe('clean photo', () => {
    it('passes with no reasons and no stripped regions', () => {
      const result = decideModeration(signals());
      expect(result.allowed).toBe(true);
      expect(result.qualityOk).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.strippedRegions).toHaveLength(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Combined scenarios                                               */
  /* ---------------------------------------------------------------- */

  describe('combined signals', () => {
    it('blocks when plate + low quality both fire — both reasons present', () => {
      const result = decideModeration(
        signals({ hasLicensePlate: true, qualityScore: 0.1 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.qualityOk).toBe(false);
      expect(result.reasons.some((r) => /license plate/i.test(r))).toBe(true);
      expect(result.reasons.some((r) => /quality/i.test(r))).toBe(true);
    });

    it('blocks on person even when quality is perfect', () => {
      const result = decideModeration(signals({ hasPerson: true, qualityScore: 1.0 }));
      expect(result.allowed).toBe(false);
      expect(result.qualityOk).toBe(true);
    });

    it('soft-flags house number + private interior without blocking', () => {
      const result = decideModeration(
        signals({ hasHouseNumber: true, isPrivateInterior: true }),
      );
      expect(result.allowed).toBe(true);
      expect(result.reasons.length).toBe(2);
    });
  });
});
