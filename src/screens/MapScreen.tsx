/**
 * MapScreen — LifeDex exploration map.
 *
 * Dark react-native-maps base. Shows sighting pins clustered by proximity.
 * Protected / sensitive species render as a fuzzed area circle
 * (radius = precisionMeters), NOT a point pin — exact spot stays private.
 * Category filter chips let the user narrow the overlay.
 * Tapping a pin or circle opens a bottom sheet card preview.
 *
 * Data source: useLifeDexStore().sightings (reactive — reflects new captures)
 * when no Supabase is configured; wire up a real data-fetch hook later without
 * changing this file's UI contract.
 *
 * HARD RULES enforced here:
 *   • publicLocation.hidden  → circle only, no precise pin, no callout coords
 *   • publicLocation.precisionMeters used as circle radius for ALL sightings
 *     (even non-hidden ones get a subtle ring so users see GPS fuzzing)
 *   • privatePhotoUri never referenced — only publicImageUri is shown
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

import type { Category, Rarity, Sighting } from '@/domain/types';
import { colors, radius, rarityColors, spacing, typography } from '@/theme/theme';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import { env } from '@/config/env';
import MockMapView, { type ClusteredPin } from '@/components/MockMapView';
import { ensureAnonSession, fetchCommunitySightings } from '@/lib/community';

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Pixel distance below which two pins collapse into a cluster. */
const CLUSTER_RADIUS_PX = 48;

/** Munich city centre — default camera target in mock mode. */
const INITIAL_REGION: Region = {
  latitude: 48.137,
  longitude: 11.576,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** How far the bottom sheet peeks when collapsed. */
const SHEET_PEEK = 96;
/** Full height of the bottom sheet in the expanded state. */
const SHEET_FULL = SCREEN_H * 0.44;

const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1412' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7872' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f0e' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#28332f' }] },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9aa5a0' }],
  },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#a9b5af' }],
  },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#4f7942' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#111e15' }] },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3a5235' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0b0f0e' }],
  },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2421' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f1715' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#4b5e58' }] },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#1c2b26' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#141f1c' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b7872' }],
  },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#141a18' }] },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b7872' }],
  },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#091514' }] },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#2d4a46' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#091514' }],
  },
];

/* ------------------------------------------------------------------ */
/* Category config                                                      */
/* ------------------------------------------------------------------ */

type CategoryFilter = Category | 'all';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  animal: 'Animals',
  plant: 'Plants',
  tree: 'Trees',
  mushroom: 'Fungi',
  unknown: 'Unknown',
};

const CATEGORY_ICONS: Record<CategoryFilter, string> = {
  all: '🌍',
  animal: '🦊',
  plant: '🌿',
  tree: '🌳',
  mushroom: '🍄',
  unknown: '❓',
};

/** Filters shown in the chip bar (excludes 'unknown' — not user-facing). */
const VISIBLE_FILTERS: CategoryFilter[] = ['all', 'animal', 'plant', 'tree', 'mushroom'];

/* ------------------------------------------------------------------ */
/* Rarity ordering                                                      */
/* ------------------------------------------------------------------ */

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function rarityIndex(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

function dominantRarity(sightings: Sighting[]): Rarity {
  let best: Rarity = 'common';
  let bestIdx = 0;
  for (const s of sightings) {
    const idx = rarityIndex(s.rarity);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = s.rarity;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Clustering                                                           */
/* ------------------------------------------------------------------ */

// ClusteredPin is defined in and shared with MockMapView (imported above).

/**
 * Project a lat/lng onto the screen so we can compute pixel distances
 * without a native map reference.
 */
function latLngToPixel(
  lat: number,
  lng: number,
  region: Region,
): { x: number; y: number } {
  const x = ((lng - region.longitude) / region.longitudeDelta + 0.5) * SCREEN_W;
  const y = ((region.latitude - lat) / region.latitudeDelta + 0.5) * SCREEN_H;
  return { x, y };
}

function pixelDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clusterSightings(sightings: Sighting[], region: Region): ClusteredPin[] {
  const visited = new Set<string>();
  const clusters: ClusteredPin[] = [];

  for (const s of sightings) {
    if (visited.has(s.id)) continue;

    const pA = latLngToPixel(s.publicLocation.lat, s.publicLocation.lng, region);
    const group: Sighting[] = [s];
    visited.add(s.id);

    for (const t of sightings) {
      if (visited.has(t.id)) continue;
      const pB = latLngToPixel(t.publicLocation.lat, t.publicLocation.lng, region);
      if (pixelDist(pA, pB) < CLUSTER_RADIUS_PX) {
        group.push(t);
        visited.add(t.id);
      }
    }

    const centLat = group.reduce((a, b) => a + b.publicLocation.lat, 0) / group.length;
    const centLng = group.reduce((a, b) => a + b.publicLocation.lng, 0) / group.length;

    clusters.push({
      id: group.map((x) => x.id).join('-'),
      lat: centLat,
      lng: centLng,
      sightings: group,
      rarity: dominantRarity(group),
    });
  }

  return clusters;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

// ── Rarity badge ─────────────────────────────────────────────────────

interface RarityBadgeProps {
  rarity: Rarity;
  size?: 'sm' | 'md';
}
function RarityBadge({ rarity, size = 'md' }: RarityBadgeProps) {
  const col = rarityColors[rarity];
  const isSmall = size === 'sm';
  return (
    <View
      style={[
        styles.rarityBadge,
        { backgroundColor: col + '26' },
        isSmall && styles.rarityBadgeSm,
      ]}
    >
      <Text
        style={[
          styles.rarityBadgeText,
          { color: col },
          isSmall && styles.rarityBadgeTextSm,
        ]}
      >
        {rarity.toUpperCase()}
      </Text>
    </View>
  );
}

// ── Filter chip ──────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}
function Chip({ label, icon, active, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Pin marker ───────────────────────────────────────────────────────

interface PinProps {
  rarity: Rarity;
  count: number;
  selected: boolean;
  onPress: () => void;
}
function Pin({ rarity, count, selected, onPress }: PinProps) {
  const col = rarityColors[rarity];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.pinContainer}>
      {selected && <View style={[styles.pinGlow, { borderColor: col }]} />}
      <View
        style={[
          styles.pin,
          { backgroundColor: col, borderColor: selected ? '#fff' : col + 'aa' },
        ]}
      >
        {count > 1 ? (
          <Text style={styles.pinCount}>{count > 99 ? '99+' : String(count)}</Text>
        ) : (
          <View style={styles.pinDot} />
        )}
      </View>
      {/* Drop shadow tail */}
      <View style={[styles.pinTail, { borderTopColor: col }]} />
    </TouchableOpacity>
  );
}

// ── Fuzz circle overlay ───────────────────────────────────────────────

interface FuzzCircleProps {
  sighting: Sighting;
  selected: boolean;
  onPress: () => void;
}
function FuzzCircle({ sighting, selected, onPress }: FuzzCircleProps) {
  const col = rarityColors[sighting.rarity];
  const { lat, lng, precisionMeters, hidden } = sighting.publicLocation;

  return (
    <>
      {/* Filled blur zone */}
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={precisionMeters}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeColor={col + (selected ? 'cc' : '55')}
        fillColor={col + (hidden ? '20' : '10')}
      />
      {/* Invisible centre marker to intercept taps */}
      <Marker
        coordinate={{ latitude: lat, longitude: lng }}
        onPress={onPress}
        tracksViewChanges={false}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View style={styles.fuzzTapTarget}>
          <View style={[styles.fuzzCentrePin, { backgroundColor: col }]}>
            <Text style={styles.fuzzCentrePinIcon}>{hidden ? '🔒' : '◎'}</Text>
          </View>
        </View>
      </Marker>
    </>
  );
}

// ── Sighting list row ─────────────────────────────────────────────────

interface SightingRowProps {
  sighting: Sighting;
  onPress: () => void;
}
function SightingRow({ sighting, onPress }: SightingRowProps) {
  const col = rarityColors[sighting.rarity];
  const catIcon = CATEGORY_ICONS[sighting.category] ?? '?';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.sightingRow}>
      <View style={[styles.sightingStrip, { backgroundColor: col }]} />

      <View style={[styles.sightingIconBg, { backgroundColor: col + '22' }]}>
        <Text style={styles.sightingIcon}>{catIcon}</Text>
      </View>

      <View style={styles.sightingInfo}>
        <Text style={styles.sightingName} numberOfLines={1}>
          {sighting.commonName}
        </Text>
        {sighting.scientificName != null && (
          <Text style={styles.sightingScientific} numberOfLines={1}>
            {sighting.scientificName}
          </Text>
        )}
        <View style={styles.sightingMeta}>
          <RarityBadge rarity={sighting.rarity} size="sm" />
          <Text style={styles.sightingXp}>+{sighting.xp} XP</Text>
          {sighting.publicLocation.hidden && (
            <Text style={styles.sightingProtected}>🔒 Location protected</Text>
          )}
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Map'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function MapScreen({ navigation }: Props) {
  const { sightings: storeSightings } = useLifeDexStore();

  // Other users' public sightings (Supabase). Empty when offline/disabled.
  const [community, setCommunity] = useState<Sighting[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [uid, rows] = await Promise.all([
        ensureAnonSession(),
        fetchCommunitySightings(),
      ]);
      if (!active) return;
      // Exclude our own rows — those already appear from the local store.
      const others = uid !== null ? rows.filter((r) => r.userId !== uid) : rows;
      setCommunity(others);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Local captures (full records) + other users' public community sightings.
  const allSightings = useMemo(
    () => [...storeSightings, ...community],
    [storeSightings, community],
  );

  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedHiddenId, setSelectedHiddenId] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView>(null);

  /* ── Derived data ─────────────────────────────────────────────── */

  const filtered = useMemo(
    () =>
      activeFilter === 'all'
        ? allSightings
        : allSightings.filter((s) => s.category === activeFilter),
    [allSightings, activeFilter],
  );

  // Hidden sightings → fuzz circles
  const hiddenSightings = useMemo(
    () => filtered.filter((s) => s.publicLocation.hidden),
    [filtered],
  );

  // Visible sightings → pins (may still have a precision ring)
  const visibleSightings = useMemo(
    () => filtered.filter((s) => !s.publicLocation.hidden),
    [filtered],
  );

  const clusters = useMemo(() => {
    // Native map: cluster by on-screen proximity. Mock map: one pin per sighting
    // (the fuzzed seed coords collapse to one spot, so geo-clustering would hide
    // everything behind a single pin — MockMapView lays them out itself).
    if (env.useNativeMaps) return clusterSightings(visibleSightings, region);
    return visibleSightings.map((s) => ({
      id: s.id,
      lat: s.publicLocation.lat,
      lng: s.publicLocation.lng,
      sightings: [s],
      rarity: s.rarity,
    }));
  }, [visibleSightings, region]);

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  const selectedHiddenSighting = useMemo(
    () => hiddenSightings.find((s) => s.id === selectedHiddenId) ?? null,
    [hiddenSightings, selectedHiddenId],
  );

  const sheetSightings: Sighting[] = useMemo(() => {
    if (selectedCluster != null) return selectedCluster.sightings;
    if (selectedHiddenSighting != null) return [selectedHiddenSighting];
    return [];
  }, [selectedCluster, selectedHiddenSighting]);

  /* ── Sheet animation ──────────────────────────────────────────── */

  const openSheet = useCallback(() => {
    setSheetExpanded(true);
    Animated.spring(sheetAnim, {
      toValue: 1,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start(() => {
      setSheetExpanded(false);
      setSelectedClusterId(null);
      setSelectedHiddenId(null);
    });
  }, [sheetAnim]);

  /* ── Handlers ─────────────────────────────────────────────────── */

  const handlePinPress = useCallback(
    (cluster: ClusteredPin) => {
      setSelectedClusterId(cluster.id);
      setSelectedHiddenId(null);
      openSheet();
    },
    [openSheet],
  );

  const handleFuzzPress = useCallback(
    (sighting: Sighting) => {
      setSelectedHiddenId(sighting.id);
      setSelectedClusterId(null);
      openSheet();
    },
    [openSheet],
  );

  const handleMapPress = useCallback(() => {
    if (sheetExpanded) closeSheet();
  }, [sheetExpanded, closeSheet]);

  const handleFilterChange = useCallback(
    (f: CategoryFilter) => {
      setActiveFilter(f);
      closeSheet();
    },
    [closeSheet],
  );

  const handleSightingRowPress = useCallback(
    (sighting: Sighting) => {
      navigation.navigate('CardDetail', { cardId: sighting.id });
    },
    [navigation],
  );

  /* ── Animated values ──────────────────────────────────────────── */

  const sheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_PEEK, SHEET_FULL],
  });

  const totalShown = filtered.length;
  const hiddenCount = hiddenSightings.length;

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <View style={styles.root}>
      {/* ── Map ──────────────────────────────────────────────── */}
      {/* Native maps render blank without a Google Maps key (Expo Go / emulator),
          so mock mode uses the MockMapView fallback. Toggle via env.useNativeMaps. */}
      {env.useNativeMaps ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={INITIAL_REGION}
          onRegionChangeComplete={setRegion}
          onPress={handleMapPress}
          customMapStyle={MAP_STYLE}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          showsScale={false}
          rotateEnabled={false}
          pitchEnabled={false}
          mapType={Platform.OS === 'android' ? 'none' : 'standard'}
        >
          {/* ── Fuzz circles: hidden / protected species ── */}
          {hiddenSightings.map((s) => (
            <FuzzCircle
              key={s.id}
              sighting={s}
              selected={selectedHiddenId === s.id}
              onPress={() => handleFuzzPress(s)}
            />
          ))}

          {/* ── Subtle precision ring for non-hidden sightings ── */}
          {visibleSightings.map((s) => (
            <Circle
              key={`ring-${s.id}`}
              center={{
                latitude: s.publicLocation.lat,
                longitude: s.publicLocation.lng,
              }}
              radius={s.publicLocation.precisionMeters}
              strokeWidth={0.8}
              strokeColor={rarityColors[s.rarity] + '30'}
              fillColor="transparent"
            />
          ))}

          {/* ── Clustered pin markers ── */}
          {clusters.map((cluster) => (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
              onPress={() => handlePinPress(cluster)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            >
              <Pin
                rarity={cluster.rarity}
                count={cluster.sightings.length}
                selected={selectedClusterId === cluster.id}
                onPress={() => handlePinPress(cluster)}
              />
            </Marker>
          ))}
        </MapView>
      ) : (
        <MockMapView
          clusters={clusters}
          hiddenSightings={hiddenSightings}
          selectedClusterId={selectedClusterId}
          selectedHiddenId={selectedHiddenId}
          onClusterPress={handlePinPress}
          onHiddenPress={handleFuzzPress}
          onBackgroundPress={handleMapPress}
        />
      )}

      {/* ── Top overlay ──────────────────────────────────────── */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        {/* Stats badge */}
        <View style={styles.statsRow}>
          <View style={styles.statsBadge}>
            <Text style={styles.statsText}>
              {totalShown} sighting{totalShown !== 1 ? 's' : ''}
            </Text>
            {hiddenCount > 0 && (
              <Text style={styles.statsHidden}> · {hiddenCount} 🔒</Text>
            )}
            {community.length > 0 && (
              <Text style={styles.statsHidden}> · 🌍 {community.length}</Text>
            )}
          </View>
        </View>

        {/* Category filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {VISIBLE_FILTERS.map((f) => (
            <Chip
              key={f}
              label={CATEGORY_LABELS[f]}
              icon={CATEGORY_ICONS[f]}
              active={activeFilter === f}
              onPress={() => handleFilterChange(f)}
            />
          ))}
        </ScrollView>
      </View>

      {/* ── Privacy badge (bottom-left) ───────────────────────── */}
      <View style={styles.privacyBadge} pointerEvents="none">
        <Text style={styles.privacyText}>📍 GPS fuzzed · 🔒 Protected locations hidden</Text>
      </View>

      {/* ── Bottom sheet ─────────────────────────────────────── */}
      <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
        {/* Drag handle */}
        <Pressable
          onPress={sheetExpanded ? closeSheet : undefined}
          style={styles.sheetHandle}
        >
          <View style={styles.sheetHandleBar} />
        </Pressable>

        {sheetSightings.length === 0 ? (
          /* Empty / idle state */
          <View style={styles.sheetEmpty}>
            <Text style={styles.sheetEmptyIcon}>🌿</Text>
            <Text style={styles.sheetEmptyTitle}>Explore the wild</Text>
            <Text style={styles.sheetEmptyBody}>
              Tap a pin or protected zone to see what was discovered there.
            </Text>
          </View>
        ) : (
          <>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {sheetSightings.length === 1
                  ? (sheetSightings[0]?.commonName ?? 'Sighting')
                  : `${sheetSightings.length} sightings here`}
              </Text>
              <TouchableOpacity onPress={closeSheet} style={styles.sheetClose}>
                <Text style={styles.sheetCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Protected-species notice */}
            {selectedHiddenSighting != null && (
              <View style={styles.protectedNotice}>
                <Text style={styles.protectedNoticeText}>
                  🔒 Exact location protected — approximate area shown
                </Text>
              </View>
            )}

            {/* Safety notes (first sighting that has them) */}
            {(() => {
              const notes = sheetSightings[0]?.card.safetyNotes;
              if (notes == null || notes.length === 0) return null;
              return (
                <View style={styles.safetyNotice}>
                  {notes.map((note, i) => (
                    <Text key={i} style={styles.safetyNoticeText}>
                      ⚠️ {note}
                    </Text>
                  ))}
                </View>
              );
            })()}

            {/* Sighting list */}
            <FlatList
              data={sheetSightings}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <SightingRow
                  sighting={item}
                  onPress={() => handleSightingRowPress(item)}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetList}
            />
          </>
        )}
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Map
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface + 'ee',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statsHidden: {
    ...typography.caption,
    color: colors.amber,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface + 'dd',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.teal + '33',
    borderColor: colors.teal,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  chipLabelActive: {
    color: colors.teal,
  },

  // Privacy badge
  privacyBadge: {
    position: 'absolute',
    bottom: SHEET_PEEK + 12,
    left: spacing.md,
    backgroundColor: colors.surface + 'cc',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },

  // Pin marker
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pinGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -2,
    borderRadius: 22,
    borderWidth: 2,
    opacity: 0.45,
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 4,
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff88',
  },
  pinCount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },

  // Fuzz circle centre marker
  fuzzTapTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuzzCentrePin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.88,
  },
  fuzzCentrePinIcon: {
    fontSize: 14,
  },

  // Rarity badge
  rarityBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rarityBadgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  rarityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  rarityBadgeTextSm: {
    fontSize: 9,
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 20,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    flex: 1,
  },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sheetCloseIcon: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  protectedNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.amber + '18',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.amber + '44',
  },
  protectedNoticeText: {
    ...typography.caption,
    color: colors.amber,
  },
  safetyNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.danger + '14',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger + '44',
    gap: 3,
  },
  safetyNoticeText: {
    ...typography.caption,
    color: colors.danger,
  },
  sheetList: {
    paddingBottom: spacing.xxl,
  },
  sheetEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  sheetEmptyIcon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  sheetEmptyTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  sheetEmptyBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Sighting list row
  sightingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  sightingStrip: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: spacing.sm,
  },
  sightingIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  sightingIcon: {
    fontSize: 22,
  },
  sightingInfo: {
    flex: 1,
    gap: 3,
  },
  sightingName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  sightingScientific: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  sightingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  sightingXp: {
    ...typography.label,
    color: colors.teal,
  },
  sightingProtected: {
    ...typography.label,
    color: colors.amber,
    fontSize: 10,
  },
  chevron: {
    fontSize: 24,
    color: colors.textMuted,
    marginLeft: spacing.xs,
    lineHeight: 28,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
});
