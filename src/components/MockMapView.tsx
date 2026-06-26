/**
 * MockMapView — a stylised, dependency-free "game map" fallback.
 *
 * Why: react-native-maps renders a blank tile layer in Expo Go / emulators when
 * no Google Maps API key is configured. Rather than show an empty panel, this
 * renders a Pokémon-GO-style map: a procedural street grid with parks + water,
 * a player avatar in the centre, and sightings scattered around it like
 * collectible stops.
 *
 * Layout note: in mock mode the fuzzed seed coordinates often collapse to one
 * spot, so we DON'T geo-project here. Markers are placed with a deterministic
 * golden-angle spiral around the avatar (stable per id, nicely spread, centre
 * kept clear). Geographic exactness doesn't matter in mock mode — readability
 * does. The native path (env.useNativeMaps) keeps real coordinates.
 *
 * Privacy is preserved exactly like the native path:
 *   - Visible sightings render as pins.
 *   - Hidden / protected sightings render as a CIRCLE only — never an exact pin.
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

import type { Category, Rarity, Sighting } from '@/domain/types';
import { colors, rarityColors, typography } from '@/theme/theme';

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
/* Placement (pure — unit tested)                                      */
/* ------------------------------------------------------------------ */

export interface Box {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  padX: number;
}

/** Radius (px) kept clear around the centre so markers never cover the avatar. */
export const CENTRE_CLEAR_RADIUS = 64;

/** djb2-ish hash → non-negative int. Deterministic, no deps. */
export function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** Golden angle (radians) — phyllotaxis spread. */
const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Place marker `index` of `count` around the box centre using a golden-angle
 * spiral, with a per-id jitter so the arrangement looks organic but is stable.
 * The centre is kept clear (CENTRE_CLEAR_RADIUS) for the player avatar, and the
 * result is clamped inside the padded box.
 */
export function placeMarker(
  index: number,
  seed: number,
  count: number,
  box: Box,
): { x: number; y: number } {
  const innerW = box.width - box.padX * 2;
  const innerH = box.height - box.padTop - box.padBottom;
  const cx = box.padX + innerW / 2;
  const cy = box.padTop + innerH / 2;

  const maxR = (Math.min(innerW, innerH) / 2) * 0.96;
  const span = Math.max(maxR - CENTRE_CLEAR_RADIUS, 1);

  // sqrt distribution fills the disc evenly rather than crowding the centre.
  const frac = Math.sqrt((index + 0.5) / Math.max(count, 1));
  const r = CENTRE_CLEAR_RADIUS + frac * span;

  const jitter = ((seed % 1000) / 1000) * GOLDEN_ANGLE;
  const theta = index * GOLDEN_ANGLE + jitter;

  const x = cx + r * Math.cos(theta);
  const y = cy + r * Math.sin(theta);

  return {
    x: Math.max(box.padX, Math.min(box.width - box.padX, x)),
    y: Math.max(box.padTop, Math.min(box.height - box.padBottom, y)),
  };
}

/* ------------------------------------------------------------------ */
/* Visual config                                                       */
/* ------------------------------------------------------------------ */

const CATEGORY_ICONS: Record<Category, string> = {
  animal: '🦊',
  plant: '🌿',
  tree: '🌳',
  mushroom: '🍄',
  unknown: '❓',
};

const HIDDEN_CIRCLE_SIZE = 92;
const PIN_SIZE = 46;

/* ------------------------------------------------------------------ */
/* Procedural map background (plain Views — no SVG dependency)         */
/* ------------------------------------------------------------------ */

/** Horizontal/vertical road positions (% of axis) + a couple of avenues. */
const H_ROADS = [18, 42, 67, 88];
const V_ROADS = [14, 38, 60, 82];

function MapBackdrop(): React.ReactElement {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Land base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: mapColors.land }]} />

      {/* Parks */}
      <View style={[styles.park, { top: '8%', left: '6%', width: 150, height: 120 }]} />
      <View style={[styles.park, { top: '58%', left: '54%', width: 180, height: 150 }]} />
      <View style={[styles.parkSmall, { top: '40%', left: '4%', width: 90, height: 90 }]} />

      {/* Water — a diagonal river through one corner */}
      <View style={styles.river} />

      {/* City blocks (subtle) */}
      <View style={[styles.block, { top: '24%', left: '44%' }]} />
      <View style={[styles.block, { top: '30%', left: '66%' }]} />
      <View style={[styles.block, { top: '72%', left: '20%' }]} />
      <View style={[styles.block, { top: '14%', left: '70%' }]} />

      {/* Roads */}
      {H_ROADS.map((t) => (
        <View key={`h${t}`} style={[styles.roadH, { top: `${t}%` }]} />
      ))}
      {V_ROADS.map((l) => (
        <View key={`v${l}`} style={[styles.roadV, { left: `${l}%` }]} />
      ))}
      {/* Two diagonal avenues for the game-map feel */}
      <View style={[styles.avenue, { top: '30%', transform: [{ rotate: '32deg' }] }]} />
      <View style={[styles.avenue, { top: '70%', transform: [{ rotate: '-24deg' }] }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Player avatar                                                       */
/* ------------------------------------------------------------------ */

function PlayerAvatar(): React.ReactElement {
  return (
    <View style={styles.avatarWrap} pointerEvents="none">
      <View style={styles.accuracyRing} />
      <View style={styles.avatarDisc}>
        <Text style={styles.avatarIcon}>🧭</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

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
    () => ({ width, height, padTop: 150, padBottom: 188, padX: 52 }),
    [width, height],
  );

  // Stable, spread placement for everything plotted (pins + hidden circles).
  const placements = useMemo(() => {
    const all = [
      ...clusters.map((c) => ({ id: c.id, kind: 'pin' as const })),
      ...hiddenSightings.map((s) => ({ id: s.id, kind: 'fuzz' as const })),
    ];
    const total = all.length;
    const map = new Map<string, { x: number; y: number }>();
    all.forEach((item, i) => {
      map.set(item.id, placeMarker(i, hashSeed(item.id), total, box));
    });
    return map;
  }, [clusters, hiddenSightings, box]);

  return (
    <View style={styles.surface} testID="mock-map">
      {/* Tap-catcher background + procedural map */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onBackgroundPress}>
        <MapBackdrop />
      </Pressable>

      {/* Player avatar (centre) */}
      <PlayerAvatar />

      {/* Hidden / protected → circle only (no exact pin) */}
      {hiddenSightings.map((s) => {
        const pos = placements.get(s.id) ?? { x: box.width / 2, y: box.height / 2 };
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
                left: pos.x - HIDDEN_CIRCLE_SIZE / 2,
                top: pos.y - HIDDEN_CIRCLE_SIZE / 2,
                borderColor: col + (selected ? 'dd' : '77'),
                backgroundColor: col + '22',
              },
            ]}
          >
            <Text style={styles.fuzzIcon}>🔒</Text>
          </TouchableOpacity>
        );
      })}

      {/* Visible sightings → pins */}
      {clusters.map((cluster) => {
        const pos = placements.get(cluster.id) ?? { x: box.width / 2, y: box.height / 2 };
        const col = rarityColors[cluster.rarity];
        const selected = selectedClusterId === cluster.id;
        const count = cluster.sightings.length;
        const cat = cluster.sightings[0]?.category ?? 'unknown';
        return (
          <TouchableOpacity
            key={`pin-${cluster.id}`}
            testID={`mock-pin-${cluster.id}`}
            activeOpacity={0.85}
            onPress={() => onClusterPress(cluster)}
            style={[styles.pinWrap, { left: pos.x - PIN_SIZE / 2, top: pos.y - PIN_SIZE }]}
          >
            {/* shadow base */}
            <View style={styles.pinShadow} />
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: colors.surface,
                  borderColor: col,
                },
                selected && styles.pinSelected,
              ]}
            >
              <Text style={styles.pinIcon}>{CATEGORY_ICONS[cat]}</Text>
            </View>
            {/* rarity dot + optional count */}
            {count > 1 ? (
              <View style={[styles.countBadge, { backgroundColor: col }]}>
                <Text style={styles.countBadgeText}>{count > 99 ? '99+' : String(count)}</Text>
              </View>
            ) : (
              <View style={[styles.rarityDot, { backgroundColor: col }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Palette + styles                                                    */
/* ------------------------------------------------------------------ */

const mapColors = {
  land: '#16241c',
  park: '#1d3a27',
  parkSmall: '#214330',
  water: '#123841',
  road: '#33473d',
  avenue: '#3c5247',
  block: '#1b2c23',
};

const styles = StyleSheet.create({
  surface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mapColors.land,
    overflow: 'hidden',
  },

  /* Backdrop pieces */
  park: {
    position: 'absolute',
    backgroundColor: mapColors.park,
    borderRadius: 80,
  },
  parkSmall: {
    position: 'absolute',
    backgroundColor: mapColors.parkSmall,
    borderRadius: 60,
  },
  river: {
    position: 'absolute',
    top: -80,
    right: -120,
    width: 160,
    height: 600,
    backgroundColor: mapColors.water,
    borderRadius: 80,
    transform: [{ rotate: '38deg' }],
  },
  block: {
    position: 'absolute',
    width: 54,
    height: 44,
    backgroundColor: mapColors.block,
    borderRadius: 6,
  },
  roadH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 7,
    backgroundColor: mapColors.road,
  },
  roadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 7,
    backgroundColor: mapColors.road,
  },
  avenue: {
    position: 'absolute',
    left: -80,
    right: -80,
    height: 9,
    backgroundColor: mapColors.avenue,
  },

  /* Player avatar */
  avatarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accuracyRing: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.teal + '1c',
    borderWidth: 1,
    borderColor: colors.teal + '44',
  },
  avatarDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  avatarIcon: {
    fontSize: 24,
  },

  /* Pins */
  pinWrap: {
    position: 'absolute',
    width: PIN_SIZE,
    alignItems: 'center',
  },
  pinShadow: {
    position: 'absolute',
    bottom: -3,
    width: 22,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
  },
  pinSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.12 }],
  },
  pinIcon: {
    fontSize: 22,
  },
  rarityDot: {
    position: 'absolute',
    top: -2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  countBadge: {
    position: 'absolute',
    top: -6,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  countBadgeText: {
    ...typography.label,
    color: '#06110d',
    fontWeight: '800',
    fontSize: 10,
  },

  /* Fuzz circle (protected / hidden) */
  fuzzCircle: {
    position: 'absolute',
    width: HIDDEN_CIRCLE_SIZE,
    height: HIDDEN_CIRCLE_SIZE,
    borderRadius: HIDDEN_CIRCLE_SIZE / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuzzIcon: {
    fontSize: 22,
  },
});
