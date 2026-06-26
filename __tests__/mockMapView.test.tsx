/**
 * Tests for the mock map fallback.
 *
 * Covers:
 *   - env.useNativeMaps defaults to false in mock mode (so the fallback renders).
 *   - computeBounds / projectPoint are deterministic and handle zero-span.
 *   - MockMapView renders the fallback surface + a pin per cluster.
 *   - Protected / hidden sightings render as a CIRCLE, never an exact pin.
 *   - Only the items passed in are rendered (filtering is prop-driven).
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import MockMapView, {
  placeMarker,
  hashSeed,
  CENTRE_CLEAR_RADIUS,
  type Box,
  type ClusteredPin,
} from '../src/components/MockMapView';
import type { Sighting } from '../src/domain/types';
import { env } from '../src/config/env';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const BOX: Box = { width: 400, height: 800, padTop: 150, padBottom: 188, padX: 52 };

function boxCentre(b: Box): { cx: number; cy: number } {
  const innerW = b.width - b.padX * 2;
  const innerH = b.height - b.padTop - b.padBottom;
  return { cx: b.padX + innerW / 2, cy: b.padTop + innerH / 2 };
}

function cluster(id: string, lat: number, lng: number): ClusteredPin {
  return {
    id,
    lat,
    lng,
    rarity: 'common',
    sightings: [{ id: `s-${id}` } as unknown as Sighting],
  };
}

function hidden(id: string, lat: number, lng: number): Sighting {
  return {
    id,
    rarity: 'rare',
    publicLocation: { lat, lng, precisionMeters: 2000, hidden: true },
  } as unknown as Sighting;
}

const noop = () => {};

/* ------------------------------------------------------------------ */
/* env flag                                                          */
/* ------------------------------------------------------------------ */

describe('env.useNativeMaps', () => {
  it('is false by default (mock mode) so the fallback renders', () => {
    expect(env.useNativeMaps).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Projection helpers                                                */
/* ------------------------------------------------------------------ */

describe('hashSeed', () => {
  it('is deterministic and non-negative', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0);
  });

  it('differs for different inputs', () => {
    expect(hashSeed('cat')).not.toBe(hashSeed('dog'));
  });
});

describe('placeMarker', () => {
  it('is deterministic for the same inputs', () => {
    const a = placeMarker(3, hashSeed('x'), 12, BOX);
    const b = placeMarker(3, hashSeed('x'), 12, BOX);
    expect(a).toEqual(b);
  });

  it('keeps markers inside the padded box', () => {
    for (let i = 0; i < 15; i++) {
      const p = placeMarker(i, hashSeed(`id-${i}`), 15, BOX);
      expect(p.x).toBeGreaterThanOrEqual(BOX.padX);
      expect(p.x).toBeLessThanOrEqual(BOX.width - BOX.padX);
      expect(p.y).toBeGreaterThanOrEqual(BOX.padTop);
      expect(p.y).toBeLessThanOrEqual(BOX.height - BOX.padBottom);
    }
  });

  it('keeps the centre clear for the player avatar', () => {
    const { cx, cy } = boxCentre(BOX);
    for (let i = 0; i < 15; i++) {
      const p = placeMarker(i, hashSeed(`id-${i}`), 15, BOX);
      const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      expect(dist).toBeGreaterThanOrEqual(CENTRE_CLEAR_RADIUS - 1);
    }
  });

  it('spreads markers apart (different positions per index)', () => {
    const p0 = placeMarker(0, hashSeed('a'), 8, BOX);
    const p1 = placeMarker(1, hashSeed('b'), 8, BOX);
    expect(p0).not.toEqual(p1);
  });
});

/* ------------------------------------------------------------------ */
/* Rendering                                                         */
/* ------------------------------------------------------------------ */

describe('MockMapView rendering', () => {
  it('renders the fallback surface', () => {
    const { queryByTestId } = render(
      <MockMapView
        clusters={[]}
        hiddenSightings={[]}
        selectedClusterId={null}
        selectedHiddenId={null}
        onClusterPress={noop}
        onHiddenPress={noop}
        onBackgroundPress={noop}
      />,
    );
    expect(queryByTestId('mock-map')).not.toBeNull();
  });

  it('renders a pin for each visible cluster', () => {
    const { queryByTestId } = render(
      <MockMapView
        clusters={[cluster('a', 48.1, 11.5), cluster('b', 48.2, 11.6)]}
        hiddenSightings={[]}
        selectedClusterId={null}
        selectedHiddenId={null}
        onClusterPress={noop}
        onHiddenPress={noop}
        onBackgroundPress={noop}
      />,
    );
    expect(queryByTestId('mock-pin-a')).not.toBeNull();
    expect(queryByTestId('mock-pin-b')).not.toBeNull();
  });

  it('renders protected sightings as a circle, NEVER an exact pin', () => {
    const { queryByTestId } = render(
      <MockMapView
        clusters={[cluster('a', 48.1, 11.5)]}
        hiddenSightings={[hidden('secret', 48.3, 11.7)]}
        selectedClusterId={null}
        selectedHiddenId={null}
        onClusterPress={noop}
        onHiddenPress={noop}
        onBackgroundPress={noop}
      />,
    );
    // Circle present...
    expect(queryByTestId('mock-fuzz-secret')).not.toBeNull();
    // ...but no precise pin for the protected sighting.
    expect(queryByTestId('mock-pin-secret')).toBeNull();
  });

  it('only renders the items it is given (prop-driven filtering)', () => {
    const { queryByTestId } = render(
      <MockMapView
        clusters={[cluster('a', 48.1, 11.5)]}
        hiddenSightings={[]}
        selectedClusterId={null}
        selectedHiddenId={null}
        onClusterPress={noop}
        onHiddenPress={noop}
        onBackgroundPress={noop}
      />,
    );
    expect(queryByTestId('mock-pin-a')).not.toBeNull();
    expect(queryByTestId('mock-pin-b')).toBeNull();
  });
});
