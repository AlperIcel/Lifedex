/**
 * CaptureScreen — full-screen camera with gallery upload.
 *
 * On capture/upload the screen calls createSightingFromImage() exactly once.
 * The pipeline (moderate → recognize → score → locationPrivacy → card → persist)
 * runs inside that service; this screen only drives UI state.
 *
 * Privacy rules:
 * - The original photo URI is private; it is passed into the pipeline but
 *   never navigated-to or displayed publicly after processing.
 * - GPS is acquired here (permission prompt) and forwarded as an optional
 *   GeoPoint; the pipeline applies locationPrivacy internally.
 * - On blocked result no sighting is persisted and the user sees a friendly
 *   message.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import type { GeoPoint } from '@/domain/types';
import { createSightingFromImage } from '@/services/sightingPipeline';
import { MOCK_HINTS, type MockHint } from '@/providers/mock/mockVision';
import { env } from '@/config/env';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import { colors, radius, spacing, typography } from '@/theme/theme';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * CaptureScreen is a tab screen nested inside the 'Tabs' stack route, so it
 * uses a CompositeScreenProps that merges tab-level params with the root stack
 * navigator so `navigation.navigate('Result', …)` type-checks correctly.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Capture'>,
  NativeStackScreenProps<RootStackParamList>
>;

type PipelineState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'blocked'; reasons: string[] }
  | { phase: 'duplicate'; species: string; sameSpotToday: boolean }
  | { phase: 'error'; message: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const PHASE_LABELS: Record<string, string> = {
  running: 'Identifying species…',
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function FramingHint(): React.ReactElement {
  return (
    <View style={styles.framingContainer} pointerEvents="none">
      {/* Corner brackets */}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
      <Text style={styles.framingHint}>
        Frame the creature or plant clearly
      </Text>
    </View>
  );
}

interface PipelineOverlayProps {
  state: PipelineState;
  onDismiss: () => void;
  onViewCollection: () => void;
}

function PipelineOverlay({ state, onDismiss, onViewCollection }: PipelineOverlayProps): React.ReactElement | null {
  if (state.phase === 'idle') return null;

  if (state.phase === 'running') {
    const label = PHASE_LABELS['running'] ?? 'Processing…';
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <ActivityIndicator size="large" color={colors.teal} />
          <Text style={styles.overlayTitle}>{label}</Text>
          <View style={styles.phaseRow}>
            {(['check', 'identify', 'score', 'card'] as const).map((p) => (
              <View key={p} style={[styles.phaseDot, styles.phaseDotActive]} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (state.phase === 'blocked') {
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayIcon}>🚫</Text>
          <Text style={styles.overlayTitle}>Photo blocked</Text>
          <Text style={styles.overlayBody}>
            {state.reasons.join('\n')}
          </Text>
          <TouchableOpacity style={styles.overlayBtn} onPress={onDismiss}>
            <Text style={styles.overlayBtnText}>Try another photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state.phase === 'duplicate') {
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayIcon}>✅</Text>
          <Text style={styles.overlayTitle}>Already discovered</Text>
          <Text style={styles.overlayBody}>
            {state.sameSpotToday
              ? `You already logged ${state.species} near here today.`
              : `${state.species} is already in your collection. Find a new species to earn XP!`}
          </Text>
          <TouchableOpacity style={styles.overlayBtn} onPress={onViewCollection}>
            <Text style={styles.overlayBtnText}>View Collection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.overlayBtnGhost} onPress={onDismiss}>
            <Text style={styles.overlayBtnGhostText}>Keep exploring</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <Text style={styles.overlayIcon}>⚠️</Text>
          <Text style={styles.overlayTitle}>Something went wrong</Text>
          <Text style={styles.overlayBody}>{state.message}</Text>
          <TouchableOpacity style={styles.overlayBtn} onPress={onDismiss}>
            <Text style={styles.overlayBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

/* Emoji + label for each mock test subject. */
const MOCK_HINT_META: Record<MockHint, { icon: string; label: string }> = {
  cat: { icon: '🐱', label: 'Cat' },
  dog: { icon: '🐶', label: 'Dog' },
  frog: { icon: '🐸', label: 'Frog' },
  bird: { icon: '🐦', label: 'Bird' },
  tree: { icon: '🌳', label: 'Tree' },
  flower: { icon: '🌼', label: 'Flower' },
  mushroom: { icon: '🍄', label: 'Mushroom' },
};

interface MockPickerBarProps {
  selected: MockHint | null;
  onSelect: (hint: MockHint | null) => void;
}

/**
 * Mock-mode only: lets the tester pick a predictable species instead of the
 * hash-random simulated result. "Auto" (null) falls back to the deterministic
 * hash. Hidden entirely once real AI recognition is wired up (env.isMockAi).
 */
function MockPickerBar({ selected, onSelect }: MockPickerBarProps): React.ReactElement {
  return (
    <View style={styles.mockBar} pointerEvents="box-none">
      <Text style={styles.mockBarTitle}>
        Simulated result — real AI recognition not connected yet
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mockChipRow}
      >
        <TouchableOpacity
          style={[styles.mockChip, selected === null && styles.mockChipActive]}
          onPress={() => onSelect(null)}
          accessibilityLabel="Auto-detect (random mock)"
        >
          <Text style={styles.mockChipIcon}>🎲</Text>
          <Text style={styles.mockChipLabel}>Auto</Text>
        </TouchableOpacity>
        {MOCK_HINTS.map((hint) => {
          const meta = MOCK_HINT_META[hint];
          const active = selected === hint;
          return (
            <TouchableOpacity
              key={hint}
              style={[styles.mockChip, active && styles.mockChipActive]}
              onPress={() => onSelect(hint)}
              accessibilityLabel={`Test subject: ${meta.label}`}
            >
              <Text style={styles.mockChipIcon}>{meta.icon}</Text>
              <Text style={styles.mockChipLabel}>{meta.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

export default function CaptureScreen({ navigation }: Props): React.ReactElement {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState>({ phase: 'idle' });
  // Mock-mode test-subject pick (null = deterministic auto). Ignored by real AI.
  const [mockSpecies, setMockSpecies] = useState<MockHint | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Shutter button animation
  const shutterScale = useRef(new Animated.Value(1)).current;
  const captureActive = pipeline.phase !== 'idle';

  /* ---------- Permission request on mount ---------- */
  useEffect(() => {
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  /* ---------- Pipeline ---------- */
  const runPipeline = useCallback(
    async (imageUri: string) => {
      setPreviewUri(imageUri);
      setPipeline({ phase: 'running' });

      // Acquire GPS FAST — never gate the result on a slow GPS lock (emulators
      // and cold starts can take many seconds). Use the instant last-known fix;
      // only fall back to a time-boxed fresh fix. The point is fuzzed anyway, so
      // low accuracy is fine. If nothing arrives quickly, proceed without it.
      let location: GeoPoint | undefined;
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        const granted = existing.granted
          ? true
          : (await Location.requestForegroundPermissionsAsync()).granted;
        if (granted) {
          const last = await Location.getLastKnownPositionAsync();
          if (last !== null) {
            location = { lat: last.coords.latitude, lng: last.coords.longitude };
          } else {
            const fresh = await Promise.race<Location.LocationObject | null>([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
            ]);
            if (fresh !== null) {
              location = { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
            }
          }
        }
      } catch {
        // Location is optional — proceed without it.
      }

      try {
        const result = await createSightingFromImage({
          imageUri,
          location,
          // Mock-only hint; undefined in real mode or when "Auto" is selected.
          mockSpecies: env.isMockAi && mockSpecies !== null ? mockSpecies : undefined,
        });

        if (!result.ok) {
          // Moderation blocked
          const reasons =
            result.reasons.length > 0
              ? result.reasons
              : ['This photo cannot be processed due to content policy.'];
          setPipeline({ phase: 'blocked', reasons });
          return;
        }

        if (result.duplicate) {
          // Species already in the collection — no new card.
          setPreviewUri(null);
          setPipeline({
            phase: 'duplicate',
            species: result.species,
            sameSpotToday: result.sameSpotToday,
          });
          return;
        }

        setPipeline({ phase: 'idle' });
        setPreviewUri(null);
        navigation.navigate('Result', { sightingId: result.sightingId });
      } catch {
        setPipeline({ phase: 'error', message: 'An unexpected error occurred.' });
      }
    },
    [navigation, mockSpecies],
  );

  /* ---------- Capture ---------- */
  const handleCapture = useCallback(async () => {
    if (captureActive || cameraRef.current === null) return;

    // Shutter animation
    Animated.sequence([
      Animated.timing(shutterScale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(shutterScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri !== undefined) {
        await runPipeline(photo.uri);
      }
    } catch {
      setPipeline({ phase: 'error', message: 'Failed to take photo.' });
    }
  }, [captureActive, runPipeline, shutterScale]);

  /* ---------- Flip ---------- */
  const handleFlip = useCallback(() => {
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  /* ---------- Dismiss overlay ---------- */
  const handleDismiss = useCallback(() => {
    setPipeline({ phase: 'idle' });
    setPreviewUri(null);
  }, []);

  /* ---------- Duplicate: jump to collection ---------- */
  const handleViewCollection = useCallback(() => {
    setPipeline({ phase: 'idle' });
    setPreviewUri(null);
    navigation.navigate('Tabs', { screen: 'Collection' });
  }, [navigation]);

  /* ---------- Permission screens ---------- */
  if (!permission) {
    return (
      <View style={styles.centeredFill}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centeredFill}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          LifeDex uses your camera to identify animals, plants, trees and mushrooms. Your photos are private evidence — only an AI-recreated card is shared.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={() => void requestPermission()}>
          <Text style={styles.permBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ---------- Main render ---------- */
  const { width: screenW, height: screenH } = Dimensions.get('window');

  return (
    <View style={styles.root}>
      {/* Full-screen camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Preview snapshot while pipeline runs */}
      {previewUri !== null && (
        <Image
          source={{ uri: previewUri }}
          style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
          blurRadius={Platform.OS === 'android' ? 4 : 8}
        />
      )}

      {/* Dark vignette overlay */}
      <View style={styles.vignette} pointerEvents="none" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveDotLabel}>LIVE</Text>
        </View>
        <Pressable style={styles.flipBtn} onPress={handleFlip} disabled={captureActive}>
          <Text style={styles.flipIcon}>⟳</Text>
        </Pressable>
      </View>

      {/* Framing guide */}
      {!captureActive && <FramingHint />}

      {/* Mock-mode test-subject picker */}
      {env.isMockAi && !captureActive && (
        <MockPickerBar selected={mockSpecies} onSelect={setMockSpecies} />
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(spacing.xl, screenH * 0.05) }]}>
        {/* Left placeholder to keep the shutter centred. Gallery upload is
            intentionally removed — a catch must be a LIVE photo, not an old one. */}
        <View style={[styles.sideBtn, { opacity: 0 }]} pointerEvents="none">
          <Text style={styles.sideBtnIcon}>📷</Text>
        </View>

        {/* Shutter */}
        <Animated.View style={{ transform: [{ scale: shutterScale }] }}>
          <TouchableOpacity
            style={[styles.shutter, captureActive && styles.shutterDisabled]}
            onPress={() => void handleCapture()}
            disabled={captureActive}
            accessibilityLabel="Capture photo"
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </Animated.View>

        {/* Right placeholder to balance layout */}
        <View style={[styles.sideBtn, { opacity: 0 }]} pointerEvents="none">
          <Text style={styles.sideBtnIcon}>⟳</Text>
        </View>
      </View>

      {/* Screen width label for layout debug — remove in prod */}
      {__DEV__ && (
        <Text style={styles.devLabel}>
          {screenW.toFixed(0)} × {screenH.toFixed(0)}
        </Text>
      )}

      {/* Pipeline overlay (processing / blocked / duplicate / error) */}
      <PipelineOverlay
        state={pipeline}
        onDismiss={handleDismiss}
        onViewCollection={handleViewCollection}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const SHUTTER_SIZE = 76;
const SHUTTER_INNER = 60;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredFill: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },

  /* Vignette */
  vignette: {
    ...StyleSheet.absoluteFillObject,
    // Top-heavy gradient simulation via multiple overlapping radial approach
    // In RN without expo-linear-gradient we use a semi-transparent band.
    borderWidth: 0,
    borderTopWidth: 120,
    borderBottomWidth: 180,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: 'rgba(0,0,0,0.65)',
  },

  /* Top bar */
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 32,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
    marginRight: spacing.xs,
  },
  liveDotLabel: {
    ...typography.label,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  flipBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipIcon: {
    fontSize: 20,
    color: colors.textPrimary,
  },

  /* Framing */
  framingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.teal,
    opacity: 0.85,
  },
  cornerTL: {
    top: '28%',
    left: '12%',
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: radius.sm,
  },
  cornerTR: {
    top: '28%',
    right: '12%',
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: radius.sm,
  },
  cornerBL: {
    bottom: '28%',
    left: '12%',
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: radius.sm,
  },
  cornerBR: {
    bottom: '28%',
    right: '12%',
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: radius.sm,
  },
  framingHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: '46%',
  },

  /* Mock picker bar */
  mockBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 150,
    paddingHorizontal: spacing.md,
  },
  mockBarTitle: {
    ...typography.caption,
    color: colors.warning,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  mockChipRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  mockChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: 56,
  },
  mockChipActive: {
    borderColor: colors.teal,
    backgroundColor: colors.teal + '33',
  },
  mockChipIcon: {
    fontSize: 22,
  },
  mockChipLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Bottom controls */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  sideBtn: {
    width: 56,
    alignItems: 'center',
  },
  sideBtnIcon: {
    fontSize: 26,
  },
  sideBtnLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shutterDisabled: {
    borderColor: colors.textMuted,
    opacity: 0.5,
  },
  shutterInner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: colors.textPrimary,
  },

  /* Pipeline overlay */
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  overlayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  overlayTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  overlayBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  overlayIcon: {
    fontSize: 40,
  },
  overlayBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.teal,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  overlayBtnText: {
    ...typography.heading,
    color: colors.background,
    fontSize: 15,
  },
  overlayBtnGhost: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  overlayBtnGhostText: {
    ...typography.body,
    color: colors.textMuted,
  },

  /* Phase dots */
  phaseRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  phaseDotActive: {
    backgroundColor: colors.teal,
  },

  /* Permission */
  permTitle: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  permBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  permBtn: {
    backgroundColor: colors.teal,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  permBtnText: {
    ...typography.heading,
    color: colors.background,
  },

  /* Dev label */
  devLabel: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    fontSize: 10,
    color: colors.textMuted,
    opacity: 0.5,
  },
});
