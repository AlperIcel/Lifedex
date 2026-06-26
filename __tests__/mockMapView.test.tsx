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
  computeBounds,
  projectPoint,
  type Box,
  type ClusteredPin,
} from '../src/components/MockMapView';
import type { Sighting } from '../src/domain/types';
import { env } from '../src/config/env';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const BOX: Box = { width: 400, height: 800, padTop: 100, padBottom: 100, padX: 40 };

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

describe('computeBounds', () => {
  it('returns the min/max of the points', () => {
    const b = computeBounds([
      { lat: 1, lng: 2 },
      { lat: 5, lng: -3 },
      { lat: 3, lng: 4 },
    ]);
    expect(b).toEqual({ minLat: 1, maxLat: 5, minLng: -3, maxLng: 4 });
  });

  it('returns a small fallback box when empty', () => {
    const b = computeBounds([]);
    expect(b.maxLat).toBeGreaterThan(b.minLat);
    expect(b.maxLng).toBeGreaterThan(b.minLng);
  });
});

describe('projectPoint', () => {
  const bounds = { minLat: 0, maxLat: 10, minLng: 0, maxLng: 10 };

  it('keeps points inside the padded box', () => {
    const p = projectPoint(5, 5, bounds, BOX);
    expect(p.x).toBeGreaterThanOrEqual(BOX.padX);
    expect(p.x).toBeLessThanOrEqual(BOX.width - BOX.padX);
    expect(p.y).toBeGreaterThanOrEqual(BOX.padTop);
    expect(p.y).toBeLessThanOrEqual(BOX.height - BOX.padBottom);
  });

  it('inverts latitude (north is up / smaller y)', () => {
    const north = projectPoint(10, 5, bounds, BOX);
    const south = projectPoint(0, 5, bounds, BOX);
    expect(north.y).toBeLessThan(south.y);
  });

  it('centres a zero-span axis instead of dividing by zero', () => {
    const single = { minLat: 4, maxLat: 4, minLng: 7, maxLng: 7 };
    const p = projectPoint(4, 7, single, BOX);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    // centred horizontally and vertically
    expect(p.x).toBeCloseTo(BOX.padX + (BOX.width - BOX.padX * 2) / 2);
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
