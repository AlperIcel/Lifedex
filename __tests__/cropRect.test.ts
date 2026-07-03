/**
 * Tests for the pure crop-rectangle math + Vision vertices -> rect conversion.
 */
import { computeCropRect, CROP_PADDING } from '../src/providers/google/cropRect';
import { verticesToRect } from '../src/providers/google/visionMapping';

describe('computeCropRect', () => {
  it('centre-crops the whole photo when no subject box', () => {
    const c = computeCropRect(undefined, 800, 1200);
    expect(c.width).toBe(800);
    expect(c.height).toBe(800);
    expect(c.originX).toBe(0);
    expect(c.originY).toBe(200); // (1200-800)/2
  });

  it('produces a square crop', () => {
    const c = computeCropRect({ x: 0.1, y: 0.1, w: 0.4, h: 0.6 }, 1000, 1000);
    expect(c.width).toBe(c.height);
  });

  it('stays fully inside the image', () => {
    const c = computeCropRect({ x: 0.7, y: 0.7, w: 0.3, h: 0.3 }, 1000, 1000);
    expect(c.originX).toBeGreaterThanOrEqual(0);
    expect(c.originY).toBeGreaterThanOrEqual(0);
    expect(c.originX + c.width).toBeLessThanOrEqual(1000);
    expect(c.originY + c.height).toBeLessThanOrEqual(1000);
  });

  it('pads around the subject box', () => {
    // A 200px-wide box padded by CROP_PADDING on each side -> square >= padded width.
    const c = computeCropRect({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 1000, 1000);
    expect(c.width).toBeGreaterThanOrEqual(Math.round(200 * (1 + CROP_PADDING * 2)) - 1);
  });

  it('handles a zero-size image safely', () => {
    const c = computeCropRect({ x: 0, y: 0, w: 1, h: 1 }, 0, 0);
    expect(c).toEqual({ originX: 0, originY: 0, width: 0, height: 0 });
  });
});

describe('verticesToRect', () => {
  it('converts the real dog bounding poly to a rect', () => {
    // Actual Google Vision output for the dog photo.
    const rect = verticesToRect([
      { x: 0.016357422, y: 0.079589844 },
      { x: 0.88671875, y: 0.079589844 },
      { x: 0.88671875, y: 1 },
      { x: 0.016357422, y: 1 },
    ]);
    expect(rect).toBeDefined();
    expect(rect!.x).toBeCloseTo(0.0164, 3);
    expect(rect!.y).toBeCloseTo(0.0796, 3);
    expect(rect!.w).toBeCloseTo(0.8704, 3);
    expect(rect!.h).toBeCloseTo(0.9204, 3);
  });

  it('treats omitted x/y as 0 (Google quirk)', () => {
    const rect = verticesToRect([{ y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 1 }, { y: 1 }]);
    expect(rect).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('returns undefined for empty or degenerate boxes', () => {
    expect(verticesToRect(undefined)).toBeUndefined();
    expect(verticesToRect([])).toBeUndefined();
    expect(verticesToRect([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }])).toBeUndefined();
  });
});
