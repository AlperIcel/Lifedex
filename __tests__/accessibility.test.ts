/**
 * Tests for src/domain/accessibility.ts — the capture-time "where did you find
 * it?" mapping to captiveStatus + map reachability.
 */
import { resolveCaptiveStatus, isPubliclyReachable } from '../src/domain/accessibility';
import type { CaptiveStatus } from '../src/domain/types';

describe('resolveCaptiveStatus', () => {
  it("'home' forces domestic, whatever the recogniser guessed", () => {
    expect(resolveCaptiveStatus('wild', 'home')).toBe('domestic');
    expect(resolveCaptiveStatus('domestic', 'home')).toBe('domestic');
    expect(resolveCaptiveStatus('zoo_captive', 'home')).toBe('domestic');
    expect(resolveCaptiveStatus('unknown', 'home')).toBe('domestic');
  });

  it("'outdoors' respects the recogniser's value (never upgrades to wild)", () => {
    expect(resolveCaptiveStatus('wild', 'outdoors')).toBe('wild');
    // A pet is domestic wherever it's photographed — outdoors does NOT make it wild.
    expect(resolveCaptiveStatus('domestic', 'outdoors')).toBe('domestic');
    expect(resolveCaptiveStatus('zoo_captive', 'outdoors')).toBe('zoo_captive');
  });

  it('unset (undefined) behaves like outdoors — respects the recogniser', () => {
    expect(resolveCaptiveStatus('wild', undefined)).toBe('wild');
    expect(resolveCaptiveStatus('domestic', undefined)).toBe('domestic');
  });
});

describe('isPubliclyReachable', () => {
  it('only wild finds are publicly reachable', () => {
    expect(isPubliclyReachable('wild')).toBe(true);
    expect(isPubliclyReachable('domestic')).toBe(false);
    expect(isPubliclyReachable('zoo_captive')).toBe(false);
    expect(isPubliclyReachable('unknown')).toBe(false);
  });

  it('a home catch is never publicly reachable', () => {
    const status: CaptiveStatus = resolveCaptiveStatus('wild', 'home');
    expect(isPubliclyReachable(status)).toBe(false);
  });
});
