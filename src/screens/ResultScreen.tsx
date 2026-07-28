/**
 * ResultScreen — displays an already-created sighting record.
 *
 * The post-capture card reveal — the emotional peak of LifeDex. Layered so the
 * card is the star:
 *
 *   1. Opens on a near-black scrim; the card BACK idles with a subtle float.
 *   2. The card flips (overshoot easing). At flip completion a success haptic
 *      fires — a heavier beat for epic/legendary.
 *   3. Only THEN does the rest stagger in below the card: species name,
 *      scientific name, status badges, XP banner, description, actions.
 *   4. The XP banner counts up with a rarity-colour hairline filling in sync.
 *   5. Epic/legendary get a soft radial glow behind the card and a diagonal
 *      shimmer sweep across the face.
 *
 * HARD RULES enforced:
 *   - The pipeline is NEVER called here. This screen is display-only.
 *   - privatePhotoUri is never rendered anywhere on this screen.
 *   - Only publicImageUri (AI-recreation) appears in the card face.
 *   - If the record is missing from the store → clean error state, no crash.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/navigation/types';
import type { CardMetadata, Sighting } from '@/domain/types';
import { env } from '@/config/env';
import { AchievementToast } from '@/components/AchievementToast';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LevelUpOverlay } from '@/components/LevelUpOverlay';
import { MockCardImage } from '@/components/MockCardImage';
import { RarityBadge } from '@/components/RarityBadge';
import { lifeDexStore, useLifeDexStore } from '@/store/useLifeDexStore';
import { haptics } from '@/utils/haptics';
import { sound } from '@/utils/sound';
import {
  colors,
  elevation,
  motion,
  numeric,
  rarityColors,
  rarityTints,
  spacing,
  radius,
  typography,
} from '@/theme/theme';
import type { Rarity, Category } from '@/domain/types';
import { useT, useCommon, useLang } from '@/i18n';
import type { Lang } from '@/i18n';
import { useSettings, formatDistance } from '@/store/settings';
import { useReduceMotion } from '@/hooks/useReduceMotion';

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    cardBackTagline: 'Nature Collected',
    protectedSpecies: 'Protected Species',
    sensitive: 'Sensitive',
    blocked: 'Blocked',
    matchPercent: '{percent}% match',
    locationHidden: 'Location hidden (protected species)',
    locationFuzzed: 'Location fuzzed to ~{d}',
    conservationNotice: 'Conservation Notice',
    mockDetectionNotice: 'Mock Detection — real AI recognition not connected yet',
    sightingNotFound: 'Sighting Not Found',
    sightingNotFoundBody:
      'This sighting record could not be loaded. It may not have been saved yet.',
    goBack: 'Go Back',
    viewCollection: 'View Collection',
    captureAnother: 'Capture Another',
    newSpeciesBadge: 'New species!',
  },
  de: {
    cardBackTagline: 'Natur gesammelt',
    protectedSpecies: 'Geschützte Art',
    sensitive: 'Sensible Art',
    blocked: 'Blockiert',
    matchPercent: '{percent}% Übereinstimmung',
    locationHidden: 'Standort verborgen (geschützte Art)',
    locationFuzzed: 'Standort auf ca. {d} verwischt',
    conservationNotice: 'Naturschutzhinweis',
    mockDetectionNotice: 'Mock-Erkennung — echte KI-Erkennung noch nicht angebunden',
    sightingNotFound: 'Sichtung nicht gefunden',
    sightingNotFoundBody:
      'Dieser Sichtungseintrag konnte nicht geladen werden. Er wurde möglicherweise noch nicht gespeichert.',
    goBack: 'Zurück',
    viewCollection: 'Sammlung ansehen',
    captureAnother: 'Nochmal aufnehmen',
    newSpeciesBadge: 'Neue Art!',
  },
} as const;

/** Per-tier flavor line shown under the species name — a small emotional
 * flourish beyond the plain rarity label from `useCommon().rarity`. */
const RARITY_FLAVOR: Record<Lang, Record<Rarity, string>> = {
  en: {
    common: 'Nice find',
    uncommon: 'Good spot!',
    rare: 'Rare catch!',
    epic: 'Epic discovery!',
    legendary: 'Legendary!',
  },
  de: {
    common: 'Schöner Fund',
    uncommon: 'Guter Fang!',
    rare: 'Seltener Fund!',
    epic: 'Epische Entdeckung!',
    legendary: 'Legendär!',
  },
};

/** Current-language flavor-line lookup, mirrors the `useCommon()` pattern. */
function useRarityFlavor(): (r: Rarity) => string {
  const lang = useLang();
  return (r) => RARITY_FLAVOR[lang][r] ?? RARITY_FLAVOR.en[r];
}

/* ------------------------------------------------------------------ */
/* Types & constants                                                    */
/* ------------------------------------------------------------------ */

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

/** Mutable copy of the tabular-nums helper (RN TextStyle wants a mutable array). */
const tabularNums = { fontVariant: [...numeric.fontVariant] };

/** Pixel dimensions for the card — portrait trading-card ratio. */
const CARD_WIDTH = 280;
const CARD_HEIGHT = 400;

/** Duration of the flip-in animation (ms). */
const FLIP_DURATION = motion.duration.reveal;

/** XP count-up duration (ms). */
const XP_COUNT_DURATION = 1400;

/** Idle-float full cycle duration (ms). */
const FLOAT_CYCLE = 2200;

/** Pre-flip card-back glow peak opacity per rarity — anticipation cue: the
 * rarer the catch, the stronger the card back glows while it waits to flip. */
const CARD_BACK_GLOW_OPACITY: Record<Rarity, number> = {
  common: 0.10,
  uncommon: 0.18,
  rare: 0.28,
  epic: 0.42,
  legendary: 0.62,
};

/** Flip-in duration per rarity — epic/legendary get a slower, weightier flip
 * (common/uncommon/rare keep the plain baseline). */
const FLIP_DURATION_BY_RARITY: Record<Rarity, number> = {
  common: FLIP_DURATION,
  uncommon: FLIP_DURATION,
  rare: FLIP_DURATION,
  epic: FLIP_DURATION + 200,
  legendary: FLIP_DURATION + 380,
};

/** Pre-flip anticipation hold (ms) — rarer catches linger a beat longer on
 * the glowing card back before flipping. */
const FLIP_HOLD_BY_RARITY: Record<Rarity, number> = {
  common: 900,
  uncommon: 900,
  rare: 900,
  epic: 1050,
  legendary: 1250,
};

/** Sunburst full rotation period (ms) per rarity — only epic/legendary render
 * it; legendary spins a little livelier. */
const SUNBURST_ROTATION_MS: Record<Rarity, number> = {
  common: 14000,
  uncommon: 14000,
  rare: 14000,
  epic: 13000,
  legendary: 9000,
};

/** Rising-sparkle particle count behind the card — 0 for common/uncommon/rare
 * (kept plain), moderate for epic/legendary (perf-conscious escalation). */
const PARTICLE_COUNT: Record<Rarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 5,
  legendary: 8,
};

/** Bounding box for the rotating sunburst rays — bigger than the card so the
 * beams read as radiating outward past its edges. */
const SUNBURST_SIZE = CARD_HEIGHT + 160;

/** Delay between staggered reveal items (ms). */
const STAGGER_DELAY = 90;

/** Width of the XP progress hairline. */
const XP_TRACK_WIDTH = 180;

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  animal: 'paw-outline',
  plant: 'flower-outline',
  tree: 'leaf-outline',
  mushroom: 'umbrella-outline',
  unknown: 'help-circle-outline',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useXpCountUp(target: number, duration: number, active: boolean, reduceMotion: boolean): number {
  const [displayed, setDisplayed] = useState(0);
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || target === 0) return;

    // Reduced motion: show the target value immediately — no count-up
    // animation. Haptic/sound feedback lives in the caller and is unaffected.
    if (reduceMotion) {
      setDisplayed(target);
      return;
    }

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      startRef.current = null;
    };
  }, [target, duration, active, reduceMotion]);

  return displayed;
}

/* ------------------------------------------------------------------ */
/* Reveal — staggered fade + rise wrapper                              */
/* ------------------------------------------------------------------ */

interface RevealProps {
  anim: Animated.Value;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Fades in + rises 12→0 as `anim` goes 0→1. Content stays mounted. */
function Reveal({ anim, style, children }: RevealProps): React.JSX.Element {
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* New-species badge — shown only on a species' first-ever capture      */
/* ------------------------------------------------------------------ */

/** Rarity-tinted "first catch" badge with a gentle breathing pulse once revealed. */
function NewSpeciesBadge({
  rarity,
  active,
  reduceMotion,
}: {
  rarity: Rarity;
  active: boolean;
  reduceMotion: boolean;
}): React.JSX.Element {
  const t = useT(C);
  const pulse = useRef(new Animated.Value(1)).current;
  const color = rarityColors[rarity];

  useEffect(() => {
    // Endless decorative pulse — skip it under reduced motion; `pulse` stays
    // at its resting value (1), so the badge just sits still.
    if (!active || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 700,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.newBadge,
        { backgroundColor: rarityTints[rarity], borderColor: color, transform: [{ scale: pulse }] },
      ]}
    >
      <Ionicons name="sparkles" size={13} color={color} />
      <Text style={[styles.newBadgeText, { color }]}>{t('newSpeciesBadge')}</Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Idle float — subtle vertical drift while the card back waits        */
/* ------------------------------------------------------------------ */

function IdleFloat({
  settled,
  reduceMotion,
  children,
}: {
  settled: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const float = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Endless decorative loop — skip it under reduced motion; `float` stays
    // at 0, so the card sits still instead of idling.
    if (reduceMotion) return;
    const sine = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -4,
          duration: FLOAT_CYCLE / 4,
          easing: sine,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 4,
          duration: FLOAT_CYCLE / 2,
          easing: sine,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: FLOAT_CYCLE / 4,
          easing: sine,
          useNativeDriver: true,
        }),
      ]),
    );
    loopRef.current = loop;
    loop.start();
    return () => loop.stop();
  }, [float, reduceMotion]);

  // Once the reveal completes, glide back to rest so the card sits still.
  useEffect(() => {
    if (!settled || reduceMotion) return;
    loopRef.current?.stop();
    Animated.timing(float, {
      toValue: 0,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }, [settled, float, reduceMotion]);

  return (
    <Animated.View style={{ transform: [{ translateY: float }] }}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Rarity glow — two stacked tint layers behind epic/legendary cards   */
/* ------------------------------------------------------------------ */

function RarityGlow({
  rarity,
  visible,
}: {
  rarity: Rarity;
  visible: boolean;
}): React.JSX.Element | null {
  const opacity = useRef(new Animated.Value(0)).current;
  const isHighTier = rarity === 'epic' || rarity === 'legendary';

  useEffect(() => {
    if (!visible || !isHighTier) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.slow * 2,
      easing: motion.easing.decel,
      useNativeDriver: true,
    }).start();
  }, [visible, isHighTier, opacity]);

  if (!isHighTier) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.glowWrap, { opacity }]}>
      <View style={[styles.glowOuter, { backgroundColor: rarityTints[rarity] }]} />
      <View style={[styles.glowInner, { backgroundColor: rarityTints[rarity] }]} />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Rarity sunburst — rotating light rays for epic/legendary reveals    */
/* ------------------------------------------------------------------ */

/** Two counter-rotating "+" crosses (4 thin bars total) sharing one driver
 * value — cheap (no SVG, 4 plain Views) but reads as an 8-spoke sunburst
 * since the layers sweep past each other in opposite directions. Epic/
 * legendary only; common/uncommon/rare render nothing. */
function RaritySunburst({
  rarity,
  visible,
}: {
  rarity: Rarity;
  visible: boolean;
}): React.JSX.Element | null {
  const isHighTier = rarity === 'epic' || rarity === 'legendary';
  const rotation = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !isHighTier) return;

    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: SUNBURST_ROTATION_MS[rarity],
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();

    const flicker = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: motion.duration.slow * 2,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0.45,
          duration: motion.duration.slow * 2,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    flicker.start();

    return () => {
      spin.stop();
      flicker.stop();
    };
  }, [visible, isHighTier, rarity, rotation, breathe]);

  if (!isHighTier) return null;

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // Same speed, opposite direction, phase-shifted 45° — interleaves into 8 spokes.
  const spinCounter = rotation.interpolate({ inputRange: [0, 1], outputRange: ['405deg', '45deg'] });
  const color = rarityColors[rarity];

  return (
    <Animated.View pointerEvents="none" style={[styles.sunburstWrap, { opacity: breathe }]}>
      <Animated.View style={[styles.sunburstLayer, { transform: [{ rotate: spin }] }]}>
        <View style={[styles.sunburstBarH, { backgroundColor: color }]} />
        <View style={[styles.sunburstBarV, { backgroundColor: color }]} />
      </Animated.View>
      <Animated.View style={[styles.sunburstLayer, { transform: [{ rotate: spinCounter }] }]}>
        <View style={[styles.sunburstBarH, { backgroundColor: color }]} />
        <View style={[styles.sunburstBarV, { backgroundColor: color }]} />
      </Animated.View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Rarity particles — rising sparkles for epic/legendary reveals       */
/* ------------------------------------------------------------------ */

interface ParticleSpec {
  left: number;
  delay: number;
  duration: number;
  scale: number;
}

/** Deterministic pseudo-scatter (no Math.random()) so each particle gets a
 * slightly different position/timing/size without making the reveal
 * non-reproducible. */
function buildParticleSpecs(count: number): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    left: 12 + ((i * 67) % 100) * ((CARD_WIDTH - 24) / 100),
    delay: (i * 231) % 900,
    duration: 1800 + ((i * 149) % 700),
    scale: 0.7 + ((i * 37) % 100) / 200,
  }));
}

/** One rising sparkle: fades in low, drifts up past the top of the card,
 * fades out, then loops. */
function RarityParticle({
  spec,
  color,
  active,
}: {
  spec: ParticleSpec;
  color: string;
  active: boolean;
}): React.JSX.Element {
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(rise, {
        toValue: 1,
        duration: spec.duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const t = setTimeout(() => loop.start(), spec.delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [active, rise, spec.delay, spec.duration]);

  const translateY = rise.interpolate({
    inputRange: [0, 1],
    outputRange: [40, -CARD_HEIGHT - 40],
  });
  const opacity = rise.interpolate({
    inputRange: [0, 0.15, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: spec.left,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { scale: spec.scale }],
        },
      ]}
    />
  );
}

/** Field of rising sparkles behind/in front of the card — moderate count,
 * epic/legendary only (common/uncommon/rare render nothing). */
function RarityParticles({
  rarity,
  visible,
}: {
  rarity: Rarity;
  visible: boolean;
}): React.JSX.Element | null {
  const count = PARTICLE_COUNT[rarity];
  const specs = useRef(buildParticleSpecs(count)).current;

  if (count === 0) return null;

  const color = rarityColors[rarity];

  return (
    <View pointerEvents="none" style={styles.particleField}>
      {specs.map((spec, i) => (
        <RarityParticle key={i} spec={spec} color={color} active={visible} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Card shimmer — diagonal gradient sweep across the revealed face     */
/* ------------------------------------------------------------------ */

/** Diagonal light sweep that crosses the card face once after the flip. The
 * post-flip pause before it sweeps is keyed to the SAME per-rarity flip
 * duration as FlipCard, so epic/legendary's slower flip keeps the shimmer
 * proportionally in sync rather than firing early. */
function CardShimmer({ active, rarity }: { active: boolean; rarity: Rarity }): React.JSX.Element {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const delay = setTimeout(() => {
      Animated.timing(sweep, {
        toValue: 1,
        duration: 900,
        easing: motion.easing.decel,
        useNativeDriver: true,
      }).start();
    }, FLIP_DURATION_BY_RARITY[rarity] + 100);
    return () => clearTimeout(delay);
  }, [active, sweep, rarity]);

  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_WIDTH, CARD_WIDTH * 2],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        styles.shimmer,
        { transform: [{ translateX }, { skewX: '-15deg' }] },
      ]}
    >
      <LinearGradient
        colors={[
          `${colors.textPrimary}00`,
          `${colors.textPrimary}1F`,
          `${colors.textPrimary}00`,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Rarity stamp — foil-style badge stamped on epic/legendary card faces */
/* ------------------------------------------------------------------ */

/** Small rotated foil-style badge that pops onto the card face right after
 * the flip — epic/legendary only. common/uncommon/rare stay plain. */
function RarityStamp({ rarity }: { rarity: Rarity }): React.JSX.Element | null {
  const common = useCommon();
  const isHighTier = rarity === 'epic' || rarity === 'legendary';
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isHighTier) return;
    const t = setTimeout(() => {
      Animated.timing(pop, {
        toValue: 1,
        duration: motion.duration.slow,
        easing: motion.easing.overshoot,
        useNativeDriver: true,
      }).start();
    }, 120);
    return () => clearTimeout(t);
  }, [isHighTier, pop]);

  if (!isHighTier) return null;

  const color = rarityColors[rarity];
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stampWrap,
        {
          borderColor: color,
          backgroundColor: rarityTints[rarity],
          opacity: pop,
          transform: [{ rotate: '-7deg' }, { scale }],
        },
      ]}
    >
      <Ionicons name="flash" size={12} color={color} />
      <Text style={[styles.stampText, { color }]}>{common.rarity(rarity).toUpperCase()}</Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Card faces                                                          */
/* ------------------------------------------------------------------ */

interface CardFaceProps {
  card: CardMetadata;
  imageUri: string;
  flipped: boolean;
  reduceMotion: boolean;
}

/** The visible face of the collectible card. */
function CardFace({ card, imageUri, flipped, reduceMotion }: CardFaceProps): React.JSX.Element {
  const common = useCommon();
  const rarityColor = rarityColors[card.rarity];

  return (
    <View style={[styles.cardFace, { borderColor: rarityColor }]}>
      {/* Card art: real cropped photo (file://) in google mode, styled placeholder
          for mock-card:// URIs. MockCardImage picks the right renderer. */}
      <View style={[styles.cardImageArea, { backgroundColor: colors.surfaceElevated }]}>
        <MockCardImage
          uri={imageUri}
          rarity={card.rarity}
          category={card.category}
          name={card.name}
        />
        {/* Subtle rarity glow strip at bottom of image */}
        <View style={[styles.cardImageGlow, { backgroundColor: rarityTints[card.rarity] }]} />
      </View>

      {flipped && <RarityStamp rarity={card.rarity} />}

      {/* Card info panel */}
      <View style={styles.cardInfo}>
        {/* Header row: name + rarity badge */}
        <View style={styles.cardInfoHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {card.name}
          </Text>
          <RarityBadge rarity={card.rarity} size="sm" />
        </View>

        {/* Category line */}
        <View style={styles.cardCategoryRow}>
          <Ionicons
            name={CATEGORY_ICONS[card.category] ?? 'help-circle-outline'}
            size={13}
            color={colors.textSecondary}
          />
          <Text style={styles.cardCategory}>
            {common.category(card.category)}
          </Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {Object.entries(card.stats).map(([key, val]) => (
            <View key={key} style={styles.statItem}>
              <Text style={styles.statValue}>{String(val)}</Text>
              <Text style={styles.statKey}>{key}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Purely decorative — skip it entirely under reduced motion. */}
      {flipped && !reduceMotion && <CardShimmer active rarity={card.rarity} />}
    </View>
  );
}

/** Soft rarity-tinted glow behind the card back — pulses while the card
 * waits to flip, stronger for rarer catches (anticipation cue). Lives and
 * dies with CardBack's own mount cycle (unmounts once the flip crosses 90°). */
function CardBackGlow({ rarity, reduceMotion }: { rarity: Rarity; reduceMotion: boolean }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;
  const peak = CARD_BACK_GLOW_OPACITY[rarity];

  useEffect(() => {
    // Endless decorative pulse — skip it under reduced motion; render at a
    // steady peak glow instead (see `opacity` below) rather than animating.
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: FLOAT_CYCLE,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: FLOAT_CYCLE,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const opacity = reduceMotion
    ? peak
    : pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [peak * 0.45, peak],
      });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: rarityColors[rarity], opacity }]}
    />
  );
}

/** Card back — shown while the reveal waits. Tinted by rarity as an
 * anticipation cue (stronger tint = rarer catch), via CardBackGlow. */
function CardBack({ rarity, reduceMotion }: { rarity: Rarity; reduceMotion: boolean }): React.JSX.Element {
  const t = useT(C);
  const color = rarityColors[rarity];
  return (
    <View style={[styles.cardFace, styles.cardBack]}>
      <CardBackGlow rarity={rarity} reduceMotion={reduceMotion} />
      <View style={[styles.cardBackEmblem, { borderColor: color }]}>
        <Ionicons name="leaf-outline" size={36} color={color} />
      </View>
      <Text style={styles.cardBackLogo}>LifeDex</Text>
      <Text style={styles.cardBackSub}>{t('cardBackTagline')}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Flip card                                                           */
/* ------------------------------------------------------------------ */

interface FlipCardProps {
  card: CardMetadata;
  imageUri: string;
  onFlipComplete: () => void;
  reduceMotion: boolean;
}

/** Flip-in animation container — starts showing back, flips to reveal face. */
function FlipCard({ card, imageUri, onFlipComplete, reduceMotion }: FlipCardProps): React.JSX.Element {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [showFront, setShowFront] = useState(false);
  // Guards onFlipComplete against firing twice (e.g. if reduceMotion changes
  // mid-flight right after the async OS check resolves) — mirrors the
  // closingRef pattern used by LevelUpOverlay/AchievementToast.
  const completedRef = useRef(false);

  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onFlipComplete();
  }, [onFlipComplete]);

  useEffect(() => {
    if (reduceMotion) {
      // Reduced motion: skip the hold + overshoot flip entirely. Jump the
      // driver straight to its end value (no observable animation) and
      // reveal the front face immediately — the user sees the finished
      // card, just without the motion. The completion callback still fires
      // so haptics/sound/phase transition behave identically either way.
      flipAnim.setValue(180);
      setShowFront(true);
      fireComplete();
      return;
    }

    // Hold on the floating card back for a beat before the flip — epic/
    // legendary linger longer (more suspense) and then flip slower/heavier.
    const t = setTimeout(() => {
      Animated.timing(flipAnim, {
        toValue: 180,
        duration: FLIP_DURATION_BY_RARITY[card.rarity],
        easing: motion.easing.overshoot,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) fireComplete();
      });
    }, FLIP_HOLD_BY_RARITY[card.rarity]);
    return () => clearTimeout(t);
  }, [reduceMotion, flipAnim, card.rarity, fireComplete]);

  // At 90° the card passes through the "invisible" point — we swap sides then.
  useEffect(() => {
    const id = flipAnim.addListener(({ value }) => {
      if (!showFront && value >= 90) setShowFront(true);
    });
    return () => flipAnim.removeListener(id);
  }, [flipAnim, showFront]);

  const backRotate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['-180deg', '0deg'],
  });

  return (
    <View style={styles.flipContainer}>
      {/* Back face */}
      {!showFront && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backfaceVisibility: 'hidden', transform: [{ rotateY: backRotate }] },
          ]}
        >
          <CardBack rarity={card.rarity} reduceMotion={reduceMotion} />
        </Animated.View>
      )}

      {/* Front face */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backfaceVisibility: 'hidden',
            opacity: showFront ? 1 : 0,
            transform: [{ rotateY: frontRotate }],
          },
        ]}
      >
        <CardFace card={card} imageUri={imageUri} flipped={showFront} reduceMotion={reduceMotion} />
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

function StatusPill({
  icon,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function StatusBadges({
  sighting,
  rarity,
}: {
  sighting: Sighting;
  rarity: Rarity;
}): React.JSX.Element {
  const t = useT(C);
  const common = useCommon();
  const captiveLabel =
    sighting.captiveStatus === 'domestic' || sighting.captiveStatus === 'zoo_captive'
      ? common.captive(sighting.captiveStatus)
      : null;

  return (
    <View style={styles.badgeRow}>
      {/* Rarity */}
      <RarityBadge rarity={rarity} />

      {/* Wild / Domestic / Zoo badge */}
      {captiveLabel !== null ? (
        <StatusPill icon="paw-outline" label={captiveLabel} color={colors.warning} />
      ) : (
        <StatusPill icon="paw-outline" label={common.captive('wild')} color={colors.success} />
      )}

      {/* Sensitivity badge */}
      {(sighting.sensitivity === 'sensitive' || sighting.sensitivity === 'protected') && (
        <StatusPill
          icon="shield-outline"
          label={sighting.sensitivity === 'protected' ? t('protectedSpecies') : t('sensitive')}
          color={colors.danger}
        />
      )}

      {/* Moderation blocked badge */}
      {!sighting.moderation.allowed && (
        <StatusPill icon="alert-circle-outline" label={t('blocked')} color={colors.danger} />
      )}

      {/* Confidence */}
      <StatusPill
        icon="analytics-outline"
        label={t('matchPercent', { percent: Math.round(sighting.confidence * 100) })}
        color={colors.textSecondary}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Location note                                                       */
/* ------------------------------------------------------------------ */

function LocationNote({ sighting }: { sighting: Sighting }): React.JSX.Element | null {
  const t = useT(C);
  const { units } = useSettings();
  if (sighting.publicLocation.hidden) {
    return (
      <View style={styles.locationNote}>
        <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
        <Text style={styles.locationNoteText}>{t('locationHidden')}</Text>
      </View>
    );
  }
  if (sighting.publicLocation.precisionMeters > 0) {
    return (
      <View style={styles.locationNote}>
        <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
        <Text style={styles.locationNoteText}>{t('locationFuzzed', { d: formatDistance(sighting.publicLocation.precisionMeters, units) })}</Text>
      </View>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Safety notes                                                        */
/* ------------------------------------------------------------------ */

function SafetyNotes({ notes }: { notes: string[] }): React.JSX.Element | null {
  const t = useT(C);
  if (notes.length === 0) return null;
  return (
    <View style={styles.safetyBox}>
      <View style={styles.safetyTitleRow}>
        <Ionicons name="shield-outline" size={13} color={colors.danger} />
        <Text style={styles.safetyTitle}>{t('conservationNotice')}</Text>
      </View>
      {notes.map((note, i) => (
        <Text key={i} style={styles.safetyNote}>
          {'• '}{note}
        </Text>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* XP Banner                                                           */
/* ------------------------------------------------------------------ */

function XpBanner({
  xp,
  rarity,
  countActive,
  reduceMotion,
}: {
  xp: number;
  rarity: Rarity;
  countActive: boolean;
  reduceMotion: boolean;
}): React.JSX.Element {
  const displayed = useXpCountUp(xp, XP_COUNT_DURATION, countActive, reduceMotion);
  const progress = useRef(new Animated.Value(0)).current;
  const rarityColor = rarityColors[rarity];

  // Hairline fills in sync with the count-up (same duration + ease-out cubic).
  useEffect(() => {
    if (!countActive || xp === 0) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: XP_COUNT_DURATION,
      easing: motion.easing.decel,
      useNativeDriver: true,
    }).start();
  }, [countActive, xp, progress, reduceMotion]);

  const fillTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-XP_TRACK_WIDTH / 2, 0],
  });

  return (
    <View style={styles.xpSection}>
      <View style={styles.xpBanner}>
        <Text style={[styles.xpValue, tabularNums, { color: rarityColor }]}>+{displayed}</Text>
        <Text style={styles.xpLabel}>XP</Text>
      </View>
      <View style={styles.xpTrack}>
        <Animated.View
          style={[
            styles.xpFill,
            {
              backgroundColor: rarityColor,
              transform: [{ translateX: fillTranslate }, { scaleX: progress }],
            },
          ]}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

type Phase = 'flipping' | 'revealed';

/** Number of staggered reveal groups below the card. */
const REVEAL_GROUPS = 6;

/** Beat after the reveal settles (stagger + XP count-up) before the
 * level-up takeover hijacks the screen — a deliberate second climax, not a
 * competing animation. */
const LEVEL_UP_REVEAL_DELAY = XP_COUNT_DURATION + 300;

/** Beat after the level-up takeover is dismissed before the achievement
 * unlock toast appears — keeps the two celebrations sequential, never
 * overlapping. */
const ACHIEVEMENT_AFTER_LEVEL_UP_DELAY = 250;

export default function ResultScreen({ route, navigation }: Props): React.JSX.Element {
  const t = useT(C);
  const flavorFor = useRarityFlavor();
  const reduceMotion = useReduceMotion();
  const { sightingId } = route.params;

  // Synchronous store lookup — no async, no pipeline.
  const { getSightingById, getCardById } = useLifeDexStore();
  const sighting = getSightingById(sightingId);

  // Derive CollectionCard from store (card id mirrors sightingId by convention).
  const cardId = `card-${sightingId}`;
  const collectionCard = getCardById(cardId);

  // Rarity resolved before hooks so the flip-completion haptic can use it.
  const rarity: Rarity =
    collectionCard?.rarity ?? sighting?.rarity ?? 'common';

  // First-ever catch of this species — drives the NEW SPECIES badge + a
  // second confirming haptic beat on reveal.
  const isFirstDiscovery = sighting?.isFirstDiscovery === true;

  // Animation phase — starts at 'flipping', transitions to 'revealed' after flip.
  const [phase, setPhase] = useState<Phase>('flipping');
  const isRevealed = phase === 'revealed';

  // One Animated.Value per staggered reveal group (name, scientific, badges,
  // XP, description, actions).
  const revealAnims = useRef(
    Array.from({ length: REVEAL_GROUPS }, () => new Animated.Value(0)),
  ).current;

  // Level-up takeover: read-and-clear the store's pending flag ONCE on mount
  // (direct singleton call, not the reactive hook — this is a one-shot queue
  // pop, not something that should re-run on every render). Shown only after
  // the card reveal has fully settled (see the delayed effect below).
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  const [levelUpVisible, setLevelUpVisible] = useState(false);

  useEffect(() => {
    const level = lifeDexStore.consumeLevelUp();
    if (level !== null) setPendingLevel(level);
  }, []);

  useEffect(() => {
    if (!isRevealed || pendingLevel === null) return;
    const t = setTimeout(() => {
      sound.levelUp();
      setLevelUpVisible(true);
    }, LEVEL_UP_REVEAL_DELAY);
    return () => clearTimeout(t);
  }, [isRevealed, pendingLevel]);

  // Achievement unlock toast: read-and-clear the store's pending queue ONCE on
  // mount (direct singleton call, same one-shot pattern as consumeLevelUp
  // above) — never re-run, so a newly-unlocked batch is shown exactly once.
  const [pendingAchievementIds, setPendingAchievementIds] = useState<string[]>([]);
  const [achievementToastVisible, setAchievementToastVisible] = useState(false);

  useEffect(() => {
    const ids = lifeDexStore.consumeAchievements();
    if (ids.length > 0) setPendingAchievementIds(ids);
  }, []);

  // Show the toast once the reveal has settled — but ONLY when there is no
  // level-up this catch. When there IS one, handleDismissLevelUp triggers the
  // toast instead, so the two celebrations never compete for the screen.
  useEffect(() => {
    if (!isRevealed || pendingAchievementIds.length === 0 || pendingLevel !== null) return;
    const t = setTimeout(() => {
      setAchievementToastVisible(true);
    }, LEVEL_UP_REVEAL_DELAY);
    return () => clearTimeout(t);
  }, [isRevealed, pendingAchievementIds, pendingLevel]);

  const handleDismissLevelUp = useCallback(() => {
    setLevelUpVisible(false);
    if (pendingAchievementIds.length > 0) {
      setTimeout(() => setAchievementToastVisible(true), ACHIEVEMENT_AFTER_LEVEL_UP_DELAY);
    }
  }, [pendingAchievementIds]);

  const handleAchievementToastDone = useCallback(() => {
    setAchievementToastVisible(false);
  }, []);

  // Fires once PER unlocked achievement, in sync with that row's entrance —
  // mirrors handleFlipComplete below (the child animation calls back, the
  // screen owns the actual haptic/sound feedback).
  const handleAchievementRowRevealed = useCallback(() => {
    haptics.success();
    sound.uiTap();
  }, []);

  const handleFlipComplete = useCallback(() => {
    // Sound in sync with the haptic beat below — base whoosh + rarity stinger.
    sound.reveal(rarity);
    // Heavier beat for the top tiers; standard success otherwise.
    if (rarity === 'epic' || rarity === 'legendary') {
      haptics.rare();
    } else {
      haptics.success();
    }
    // First-ever catch of this species gets an extra confirming beat.
    if (isFirstDiscovery) {
      setTimeout(() => haptics.success(), 220);
    }
    setPhase('revealed');
  }, [rarity, isFirstDiscovery]);

  // Stagger the content in only AFTER the flip lands.
  useEffect(() => {
    if (!isRevealed) return;
    Animated.stagger(
      STAGGER_DELAY,
      revealAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: motion.duration.slow,
          easing: motion.easing.decel,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [isRevealed, revealAnims]);

  const handleGoCollection = useCallback(() => {
    navigation.navigate('Tabs', { screen: 'Collection' });
  }, [navigation]);

  const handleRetry = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  /* ---- Render: record not found ---- */
  if (sighting === undefined) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <EmptyState
          icon="alert-circle-outline"
          title={t('sightingNotFound')}
          message={t('sightingNotFoundBody')}
          actionTitle={t('goBack')}
          onAction={handleRetry}
        />
      </View>
    );
  }

  // Use card from the sighting row directly (always present per Sighting schema).
  // Fall back to collectionCard if available (same data, either works).
  const card = collectionCard?.card ?? sighting.card;
  const publicImageUri = collectionCard?.publicImageUri ?? sighting.publicImageUri;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- The card — the star of the screen ---- */}
        <View style={styles.cardWrapper}>
          {/* Purely decorative — skip entirely under reduced motion. */}
          {!reduceMotion && <RaritySunburst rarity={rarity} visible={isRevealed} />}
          <RarityGlow rarity={rarity} visible={isRevealed} />
          <IdleFloat settled={isRevealed} reduceMotion={reduceMotion}>
            <FlipCard
              card={card}
              imageUri={publicImageUri}
              onFlipComplete={handleFlipComplete}
              reduceMotion={reduceMotion}
            />
          </IdleFloat>
          {!reduceMotion && <RarityParticles rarity={rarity} visible={isRevealed} />}
        </View>

        {/* ---- Species name (revealed after the flip) ---- */}
        <Reveal anim={revealAnims[0]!}>
          {isFirstDiscovery && (
            <NewSpeciesBadge rarity={rarity} active={isRevealed} reduceMotion={reduceMotion} />
          )}
          <Text style={styles.speciesName}>{sighting.commonName}</Text>
          <Text style={[styles.rarityFlavor, { color: rarityColors[rarity] }]}>
            {flavorFor(rarity)}
          </Text>
        </Reveal>
        <Reveal anim={revealAnims[1]!}>
          {sighting.scientificName !== undefined ? (
            <Text style={styles.scientificName}>{sighting.scientificName}</Text>
          ) : (
            <View />
          )}
        </Reveal>

        {/* ---- Status badges + location + mock notice ---- */}
        <Reveal anim={revealAnims[2]!} style={styles.fullWidth}>
          <StatusBadges sighting={sighting} rarity={rarity} />
          <LocationNote sighting={sighting} />
          {env.isMockAi && (
            <View style={styles.mockBanner}>
              <Ionicons name="flask-outline" size={12} color={colors.warning} />
              <Text style={styles.mockBannerText}>
                {t('mockDetectionNotice')}
              </Text>
            </View>
          )}
        </Reveal>

        {/* ---- XP Banner with synced hairline ---- */}
        <Reveal anim={revealAnims[3]!}>
          <XpBanner xp={sighting.xp} rarity={rarity} countActive={isRevealed} reduceMotion={reduceMotion} />
        </Reveal>

        {/* ---- Safety notes + card description ---- */}
        <Reveal anim={revealAnims[4]!} style={styles.fullWidth}>
          {card.safetyNotes !== undefined && card.safetyNotes.length > 0 && (
            <SafetyNotes notes={card.safetyNotes} />
          )}
          <View style={styles.descriptionBox}>
            <Text style={styles.descriptionText}>{card.description}</Text>
          </View>
        </Reveal>

        {/* ---- Action buttons ---- */}
        <Reveal anim={revealAnims[5]!} style={styles.fullWidth}>
          <View style={styles.actions} pointerEvents={isRevealed ? 'auto' : 'none'}>
            {/* Record is already persisted by the pipeline — go straight to collection. */}
            <Button
              title={t('viewCollection')}
              onPress={handleGoCollection}
              variant="primary"
              size="lg"
              icon="albums-outline"
              fullWidth
            />
            <Button
              title={t('captureAnother')}
              onPress={handleRetry}
              variant="ghost"
              size="lg"
              icon="camera-outline"
              fullWidth
            />
          </View>
        </Reveal>

        {/* Bottom padding */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ---- Achievement unlock toast — compact, non-blocking, stacked ---- */}
      {achievementToastVisible && pendingAchievementIds.length > 0 && (
        <AchievementToast
          ids={pendingAchievementIds}
          onDone={handleAchievementToastDone}
          onRowRevealed={handleAchievementRowRevealed}
        />
      )}

      {/* ---- Level-up takeover — grand finale, only after the reveal settles ---- */}
      {levelUpVisible && pendingLevel !== null && (
        <LevelUpOverlay level={pendingLevel} onDismiss={handleDismissLevelUp} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? spacing.xxl + spacing.md : spacing.xl,
    paddingHorizontal: spacing.md,
  },
  fullWidth: {
    width: '100%',
    alignItems: 'center',
  },

  /* ---- Card flip container ---- */
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginBottom: spacing.xl,
  },
  flipContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },

  /* ---- Rarity glow (epic/legendary) ---- */
  glowWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOuter: {
    position: 'absolute',
    width: CARD_WIDTH + 160,
    height: CARD_HEIGHT + 120,
    borderRadius: radius.pill,
  },
  glowInner: {
    position: 'absolute',
    width: CARD_WIDTH + 72,
    height: CARD_HEIGHT + 40,
    borderRadius: radius.pill,
  },

  /* ---- Rarity sunburst (epic/legendary) ---- */
  sunburstWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunburstLayer: {
    position: 'absolute',
    width: SUNBURST_SIZE,
    height: SUNBURST_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunburstBarH: {
    position: 'absolute',
    width: SUNBURST_SIZE,
    height: 2,
    borderRadius: 1,
  },
  sunburstBarV: {
    position: 'absolute',
    width: 2,
    height: SUNBURST_SIZE,
    borderRadius: 1,
  },

  /* ---- Rarity particles (epic/legendary) ---- */
  particleField: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    bottom: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  /* ---- Card face ---- */
  cardFace: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...elevation.level3,
  },
  cardBack: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardBackEmblem: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardBackLogo: {
    ...typography.title1,
    color: colors.accent,
    letterSpacing: 2,
  },
  cardBackSub: {
    ...typography.caption,
    color: colors.textTertiary,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  /* ---- Card image area ---- */
  cardImageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cardImageGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },

  /* ---- Rarity stamp (epic/legendary foil badge) ---- */
  stampWrap: {
    position: 'absolute',
    top: spacing.md,
    left: -spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    zIndex: 5,
  },
  stampText: {
    ...typography.label,
    fontWeight: '800',
    letterSpacing: 1.4,
  },

  /* ---- Card info panel ---- */
  cardInfo: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardName: {
    ...typography.headline,
    color: colors.textPrimary,
    flex: 1,
  },
  cardCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardCategory: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  statKey: {
    ...typography.label,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },

  /* ---- Shimmer ---- */
  shimmer: {
    width: CARD_WIDTH * 0.45,
  },

  /* ---- New species badge ---- */
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  newBadgeText: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  /* ---- Species header (below the card, post-reveal) ---- */
  speciesName: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  rarityFlavor: {
    ...typography.callout,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  scientificName: {
    ...typography.callout,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  /* ---- Status badges ---- */
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: {
    ...typography.label,
  },

  /* ---- Location note ---- */
  locationNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  locationNoteText: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  /* ---- Mock recognition banner ---- */
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    backgroundColor: `${colors.warning}1A`,
    borderWidth: 1,
    borderColor: `${colors.warning}55`,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  mockBannerText: {
    ...typography.label,
    color: colors.warning,
  },

  /* ---- XP section ---- */
  xpSection: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  xpBanner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  xpValue: {
    fontSize: 56,
    fontWeight: '800',
    lineHeight: 64,
    letterSpacing: -0.4,
  },
  xpLabel: {
    ...typography.title2,
    color: colors.textSecondary,
  },
  xpTrack: {
    width: XP_TRACK_WIDTH,
    height: 1,
    backgroundColor: colors.separator,
    overflow: 'hidden',
  },
  xpFill: {
    width: XP_TRACK_WIDTH,
    height: 1,
  },

  /* ---- Safety notes ---- */
  safetyBox: {
    width: '100%',
    backgroundColor: `${colors.danger}12`,
    borderWidth: 1,
    borderColor: `${colors.danger}44`,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  safetyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  safetyTitle: {
    ...typography.label,
    color: colors.danger,
    textTransform: 'uppercase',
  },
  safetyNote: {
    ...typography.footnote,
    color: colors.textSecondary,
  },

  /* ---- Description ---- */
  descriptionBox: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  /* ---- Actions ---- */
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
});
