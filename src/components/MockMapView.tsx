/**
 * MockMapView — a stylised, dependency-free fallback for the map.
 *
 * Why: react-native-maps renders a blank tile layer in Expo Go / emulators when
 * no Google Maps API key is configured. For the MVP mock mode we don't want the
 * Map screen to look empty, so this component projects sightings onto a simple
 * dark "map" surface using their own bounding box — no native module, no key.
 *
 * Privacy is preserved exactly like the native path:
 *   - Visible sightings (clusters) render as pins at a fuzzed point.
 *   - Hidden / protected sightings render as a CIRCLE only — never an exact pin.
 *
 * This is intentionally a local-test affordance. Production maps arrive later via
 * a real maps provider + API key (see env.useNativeMaps).
 */
import React, { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { Rarity, Sighting } from '@/domain/types';
import { colors, radius, rarityColors, spacing, typography } from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* Shared cluster type (also used by MapScreen)                        */
/* ------------------------------------------------------------------ */

export interface ClusteredPin {
  id: string;
  lat: number;
  lng: number;
  sightings: Sighting[];
  rarity: Rarity;
}

/* ------------------------------------------------------------------ */
/* Projection helpers (pure — unit tested)                             */
/* ------------------------------------------------------------------ */

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface Box {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  padX: number;
}

/** Bounding box of a set of points. Falls back to a tiny box when empty. */
export function computeBounds(points: Array<{ lat: number; lng: number }>): Bounds {
  if (points.length === 0) {
    return { minLat: -0.01, maxLat: 0.01, minLng: -0.01, maxLng: 0.01 };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Project a lat/lng into pixel coordinates inside the padded box.
 * A zero-span axis (single point or a line) centres on that axis so the marker
 * never divides by zero or lands off-screen.
 */
export function projectPoint(
  lat: number,
  lng: number,
  b: Bounds,
  box: Box,
): { x: number; y: number } {
  const innerW = box.width - box.padX * 2;
  const innerH = box.height - box.padTop - box.padBottom;

  const lngSpan = b.maxLng - b.minLng;
  const latSpan = b.maxLat - b.minLat;

  const fx = lngSpan === 0 ? 0.5 : (lng - b.minLng) / lngSpan;
  // Latitude is inverted on screen (north = up = smaller y).
  const fy = latSpan === 0 ? 0.5 : (b.maxLat - lat) / latSpan;

  return {
    x: box.padX + fx * innerW,
    y: box.padTop + fy * innerH,
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const HIDDEN_CIRCLE_SIZE = 88;
const PIN_SIZE = 34;
const GRID_LINES = 5;

export interface MockMapViewProps {
  clusters: ClusteredPin[];
  hiddenSightings: Sighting[];
  selectedClusterId: string | null;
  selectedHiddenId: string | null;
  onClusterPress: (cluster: ClusteredPin) => void;
  onHiddenPress: (sighting: Sighting) => void;
  onBackgroundPress: () => void;
}

export default function MockMapView({
  clusters,
  hiddenSightings,
  selectedClusterId,
  selectedHiddenId,
  onClusterPress,
  onHiddenPress,
  onBackgroundPress,
}: MockMapViewProps): React.ReactElement {
  const { width, height } = Dimensions.get('window');

  const box: Box = useMemo(
    () => ({ width, height, padTop: 132, padBottom: 168, padX: 44 }),
    [width, height],
  );

  // Bounds from ALL plotted points (clusters + hidden) so everything fits.
  const bounds = useMemo(() => {
    const pts = [
      ...clusters.map((c) => ({ lat: c.lat, lng: c.lng })),
      ...hiddenSightings.map((s) => ({
        lat: s.publicLocation.lat,
        lng: s.publicLocation.lng,
      })),
    ];
    return computeBounds(pts);
  }, [clusters, hiddenSightings]);

  return (
    <View style={styles.surface} testID="mock-map">
      {/* Tap-catcher background */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onBackgroundPress} />

      {/* Faint grid so the surface reads as a map, not a blank panel */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: GRID_LINES }).map((_, i) => (
          <View
            key={`h-${i}`}
            style={[styles.gridLineH, { top: `${((i + 1) * 100) / (GRID_LINES + 1)}%` }]}
          />
        ))}
        {Array.from({ length: GRID_LINES }).map((_, i) => (
          <View
            key={`v-${i}`}
            style={[styles.gridLineV, { left: `${((i + 1) * 100) / (GRID_LINES + 1)}%` }]}
          />
        ))}
      </View>

      {/* "Simulated map" watermark */}
      <View style={styles.watermark} pointerEvents="none">
        <Text style={styles.watermarkText}>Simulated map · no Google Maps key</Text>
      </View>

      {/* Hidden / protected → circle only (no exact pin) */}
      {hiddenSightings.map((s) => {
        const { x, y } = projectPoint(
          s.publicLocation.lat,
          s.publicLocation.lng,
          bounds,
          box,
        );
        const col = rarityColors[s.rarity];
        const selected = selectedHiddenId === s.id;
        return (
          <TouchableOpacity
            key={`fuzz-${s.id}`}
            testID={`mock-fuzz-${s.id}`}
            activeOpacity={0.8}
            onPress={() => onHiddenPress(s)}
            style={[
              styles.fuzzCircle,
              {
                left: x - HIDDEN_CIRCLE_SIZE / 2,
                top: y - HIDDEN_CIRCLE_SIZE / 2,
                borderColor: col + (selected ? 'cc' : '66'),
                backgroundColor: col + '1f',
              },
            ]}
          >
            <Text style={styles.fuzzIcon}>🔒</Text>
          </TouchableOpacity>
        );
      })}

      {/* Visible sightings → clustered pins */}
      {clusters.map((cluster) => {
        const { x, y } = projectPoint(cluster.lat, cluster.lng, bounds, box);
        const col = rarityColors[cluster.rarity];
        const selected = selectedClusterId === cluster.id;
        const count = cluster.sightings.length;
        return (
          <TouchableOpacity
            key={`pin-${cluster.id}`}
            testID={`mock-pin-${cluster.id}`}
            activeOpacity={0.85}
            onPress={() => onClusterPress(cluster)}
            style={[
              styles.pin,
              {
                left: x - PIN_SIZE / 2,
                top: y - PIN_SIZE / 2,
                backgroundColor: col,
                borderColor: selected ? '#fff' : col + 'aa',
              },
            ]}
          >
            {count > 1 ? (
              <Text style={styles.pinCount}>{count > 99 ? '99+' : String(count)}</Text>
            ) : (
              <View style={styles.pinDot} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  surface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d1412',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(120,140,130,0.10)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(120,140,130,0.10)',
  },
  watermark: {
    position: 'absolute',
    bottom: 132,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  watermarkText: {
    ...typography.label,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  fuzzCircle: {
    position: 'absolute',
    width: HIDDEN_CIRCLE_SIZE,
    height: HIDDEN_CIRCLE_SIZE,
    borderRadius: HIDDEN_CIRCLE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuzzIcon: {
    fontSize: 20,
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCount: {
    ...typography.label,
    color: '#06110d',
    fontWeight: '800',
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#06110d',
  },
});
