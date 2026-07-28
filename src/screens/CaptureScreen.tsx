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
  Easing,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import type { GeoPoint } from '@/domain/types';
import { createSightingFromImage } from '@/services/sightingPipeline';
import { MOCK_HINTS, type MockHint } from '@/providers/mock/mockVision';
import { env } from '@/config/env';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import { Button, Chip } from '@/components';
import { colors, elevation, radius, spacing, typography } from '@/theme/theme';
import { haptics } from '@/utils/haptics';

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
  | { phase: 'duplicate'; species: string }
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
      <View style={styles.framingHintPill}>
        <Text style={styles.framingHint}>Frame the creature or plant clearly</Text>
      </View>
    </View>
  );
}

/**
 * Four dots that light up one-at-a-time in sequence to signal pipeline
 * progress (moderate → recognize → score → card) without claiming to track
 * real phase boundaries. Purely decorative motion — loops while mounted.
 */
function PhaseProgressDots(): React.ReactElement {
  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const stagger = Animated.loop(
      Animated.stagger(
        150,
        anims.map((a) =>
          Animated.sequence([
            Animated.timing(a, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.25, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ),
    );
    stagger.start();
    return () => stagger.stop();
  }, [anims]);

  return (
    <View style={styles.phaseRow}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={[
            styles.phaseDot,
            {
              opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
            },
          ]}
        />
      ))}
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
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.overlayTitle}>{label}</Text>
          <PhaseProgressDots />
        </View>
      </View>
    );
  }

  if (state.phase === 'blocked') {
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <View style={[styles.overlayIconWrap, styles.overlayIconWrapDanger]}>
            <Ionicons name="shield-outline" size={32} color={colors.danger} />
          </View>
          <Text style={styles.overlayTitle}>Photo blocked</Text>
          <Text style={styles.overlayBody}>
            {state.reasons.join('\n')}
          </Text>
          <Button
            title="Try another photo"
            variant="primary"
            onPress={onDismiss}
            fullWidth
            style={styles.overlayBtnSpacing}
          />
        </View>
      </View>
    );
  }

  if (state.phase === 'duplicate') {
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <View style={[styles.overlayIconWrap, styles.overlayIconWrapAccent]}>
            <Ionicons name="checkmark-circle" size={32} color={colors.accent} />
          </View>
          <Text style={styles.overlayTitle}>Already found nearby</Text>
          <Text style={styles.overlayBody}>
            {`You've already discovered ${state.species} in this area (within ~1 km). Move on and explore — find it somewhere new, or catch a different species, to earn XP!`}
          </Text>
          <Button
            title="View Collection"
            variant="primary"
            onPress={onViewCollection}
            fullWidth
            style={styles.overlayBtnSpacing}
          />
          <Button
            title="Keep exploring"
            variant="ghost"
            onPress={onDismiss}
            fullWidth
            style={styles.overlayBtnGhostSpacing}
          />
        </View>
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={styles.overlayContainer}>
        <View style={styles.overlayCard}>
          <View style={[styles.overlayIconWrap, styles.overlayIconWrapWarning]}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.warning} />
          </View>
          <Text style={styles.overlayTitle}>Something went wrong</Text>
          <Text style={styles.overlayBody}>{state.message}</Text>
          <Button
            title="Try again"
            variant="primary"
            onPress={onDismiss}
            fullWidth
            style={styles.overlayBtnSpacing}
          />
        </View>
      </View>
    );
  }

  return null;
}

/* Ionicon + label for each mock test subject (no emoji in chrome). */
const MOCK_HINT_META: Record<MockHint, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  cat: { icon: 'paw-outline', label: 'Cat' },
  dog: { icon: 'paw-outline', label: 'Dog' },
  frog: { icon: 'leaf-outline', label: 'Frog' },
  bird: { icon: 'egg-outline', label: 'Bird' },
  tree: { icon: 'trail-sign-outline', label: 'Tree' },
  flower: { icon: 'flower-outline', label: 'Flower' },
  mushroom: { icon: 'nutrition-outline', label: 'Mushroom' },
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
        <Chip
          label="Auto"
          selected={selected === null}
          onPress={() => onSelect(null)}
          icon="shuffle-outline"
        />
        {MOCK_HINTS.map((hint) => {
          const meta = MOCK_HINT_META[hint];
          return (
            <Chip
              key={hint}
              label={meta.label}
              selected={selected === hint}
              onPress={() => onSelect(hint)}
              icon={meta.icon}
            />
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
          haptics.error();
          setPipeline({ phase: 'blocked', reasons });
          return;
        }

        if (result.duplicate) {
          // Species already in the collection — no new card.
          setPreviewUri(null);
          haptics.tap();
          setPipeline({
            phase: 'duplicate',
            species: result.species,
          });
          return;
        }

        setPipeline({ phase: 'idle' });
        setPreviewUri(null);
        navigation.navigate('Result', { sightingId: result.sightingId });
      } catch {
        haptics.error();
        setPipeline({ phase: 'error', message: 'An unexpected error occurred.' });
      }
    },
    [navigation, mockSpecies],
  );

  /* ---------- Capture ---------- */
  const handleCapture = useCallback(async () => {
    if (captureActive || cameraRef.current === null) return;

    // Shutter animation
    haptics.shutter();
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
      haptics.error();
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

      {/* Scrim gradients — top and bottom, transparent to near-black */}
      <LinearGradient
        colors={['rgba(5,9,7,0)', colors.overlay]}
        style={styles.scrimTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(5,9,7,0)', colors.overlay]}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveDotLabel}>LIVE</Text>
        </View>
        <Pressable style={styles.flipBtn} onPress={handleFlip} disabled={captureActive}>
          <Ionicons name="camera-reverse-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Framing guide */}
      {!captureActive && <FramingHint />}

      {/* Mock-mode test-subject picker */}
      {env.isMockAi && !captureActive && (
        <MockPickerBar selected={mockSpecies} onSelect={setMockSpecies} />
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: spacing.xxl }]}>
        {/* Left placeholder to keep the shutter centred. Gallery upload is
            intentionally removed — a catch must be a LIVE photo, not an old one. */}
        <View style={[styles.sideBtn, { opacity: 0 }]} pointerEvents="none" />

        {/* Shutter */}
        <Animated.View style={{ transform: [{ scale: shutterScale }] }}>
          <TouchableOpacity
            style={[styles.shutter, captureActive && styles.shutterDisabled]}
            onPress={() => void handleCapture()}
            disabled={captureActive}
            accessibilityLabel="Capture photo"
          >
            {captureActive ? (
              <View style={styles.shutterInnerActive}>
                <ActivityIndicator size="small" color={colors.onAccent} />
              </View>
            ) : (
              <View style={styles.shutterInner} />
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Right placeholder to balance layout */}
        <View style={[styles.sideBtn, { opacity: 0 }]} pointerEvents="none" />
      </View>

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

const SHUTTER_SIZE = 78;
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

  /* Scrim gradients (replace the old border-hack vignette) */
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
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
    backgroundColor: colors.overlay,
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
    textTransform: 'uppercase',
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
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
    borderColor: 'rgba(255,255,255,0.5)',
    opacity: 1,
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
  framingHintPill: {
    marginTop: '46%',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  framingHint: {
    ...typography.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
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
    backgroundColor: colors.overlay,
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
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 3.5,
    borderColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shutterDisabled: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterInner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: colors.textPrimary,
  },
  shutterInnerActive: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Pipeline overlay */
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  overlayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...elevation.level3,
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
  overlayIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayIconWrapDanger: {
    backgroundColor: `${colors.danger}22`,
  },
  overlayIconWrapAccent: {
    backgroundColor: colors.accentSubtle,
  },
  overlayIconWrapWarning: {
    backgroundColor: `${colors.warning}22`,
  },
  overlayBtnSpacing: {
    marginTop: spacing.lg,
  },
  overlayBtnGhostSpacing: {
    marginTop: spacing.sm,
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
    backgroundColor: colors.accent,
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
});
