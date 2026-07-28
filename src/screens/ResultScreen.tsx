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
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { MockCardImage } from '@/components/MockCardImage';
import { RarityBadge } from '@/components/RarityBadge';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import { haptics } from '@/utils/haptics';
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
import { useT, useCommon } from '@/i18n';

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
    locationFuzzed: 'Location fuzzed to ~{km} km',
    conservationNotice: 'Conservation Notice',
    mockDetectionNotice: 'Mock Detection — real AI recognition not connected yet',
    sightingNotFound: 'Sighting Not Found',
    sightingNotFoundBody:
      'This sighting record could not be loaded. It may not have been saved yet.',
    goBack: 'Go Back',
    viewCollection: 'View Collection',
    captureAnother: 'Capture Another',
  },
  de: {
    cardBackTagline: 'Natur gesammelt',
    protectedSpecies: 'Geschützte Art',
    sensitive: 'Sensible Art',
    blocked: 'Blockiert',
    matchPercent: '{percent}% Übereinstimmung',
    locationHidden: 'Standort verborgen (geschützte Art)',
    locationFuzzed: 'Standort auf ca. {km} km verwischt',
    conservationNotice: 'Naturschutzhinweis',
    mockDetectionNotice: 'Mock-Erkennung — echte KI-Erkennung noch nicht angebunden',
    sightingNotFound: 'Sichtung nicht gefunden',
    sightingNotFoundBody:
      'Dieser Sichtungseintrag konnte nicht geladen werden. Er wurde möglicherweise noch nicht gespeichert.',
    goBack: 'Zurück',
    viewCollection: 'Sammlung ansehen',
    captureAnother: 'Nochmal aufnehmen',
  },
} as const;

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

function useXpCountUp(target: number, duration: number, active: boolean): number {
  const [displayed, setDisplayed] = useState(0);
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || target === 0) return;

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
  }, [target, duration, active]);

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
/* Idle float — subtle vertical drift while the card back waits        */
/* ------------------------------------------------------------------ */

function IdleFloat({
  settled,
  children,
}: {
  settled: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const float = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
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
  }, [float]);

  // Once the reveal completes, glide back to rest so the card sits still.
  useEffect(() => {
    if (!settled) return;
    loopRef.current?.stop();
    Animated.timing(float, {
      toValue: 0,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }, [settled, float]);

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
/* Card shimmer — diagonal gradient sweep across the revealed face     */
/* ------------------------------------------------------------------ */

/** Diagonal light sweep that crosses the card face once after the flip. */
function CardShimmer({ active }: { active: boolean }): React.JSX.Element {
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
    }, FLIP_DURATION + 100);
    return () => clearTimeout(delay);
  }, [active, sweep]);

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
/* Card faces                                                          */
/* ------------------------------------------------------------------ */

interface CardFaceProps {
  card: CardMetadata;
  imageUri: string;
  flipped: boolean;
}

/** The visible face of the collectible card. */
function CardFace({ card, imageUri, flipped }: CardFaceProps): React.JSX.Element {
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

      {flipped && <CardShimmer active />}
    </View>
  );
}

/** Card back — shown while the reveal waits. */
function CardBack(): React.JSX.Element {
  const t = useT(C);
  return (
    <View style={[styles.cardFace, styles.cardBack]}>
      <View style={styles.cardBackEmblem}>
        <Ionicons name="leaf-outline" size={36} color={colors.accent} />
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
}

/** Flip-in animation container — starts showing back, flips to reveal face. */
function FlipCard({ card, imageUri, onFlipComplete }: FlipCardProps): React.JSX.Element {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [showFront, setShowFront] = useState(false);

  useEffect(() => {
    // Hold on the floating card back for a beat before the flip.
    const t = setTimeout(() => {
      Animated.timing(flipAnim, {
        toValue: 180,
        duration: FLIP_DURATION,
        easing: motion.easing.overshoot,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFlipComplete();
      });
    }, 900);
    return () => clearTimeout(t);
  }, [flipAnim, onFlipComplete]);

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
          <CardBack />
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
        <CardFace card={card} imageUri={imageUri} flipped={showFront} />
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
  if (sighting.publicLocation.hidden) {
    return (
      <View style={styles.locationNote}>
        <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
        <Text style={styles.locationNoteText}>{t('locationHidden')}</Text>
      </View>
    );
  }
  const precisionKm = (sighting.publicLocation.precisionMeters / 1000).toFixed(1);
  if (sighting.publicLocation.precisionMeters > 0) {
    return (
      <View style={styles.locationNote}>
        <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
        <Text style={styles.locationNoteText}>{t('locationFuzzed', { km: precisionKm })}</Text>
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
}: {
  xp: number;
  rarity: Rarity;
  countActive: boolean;
}): React.JSX.Element {
  const displayed = useXpCountUp(xp, XP_COUNT_DURATION, countActive);
  const progress = useRef(new Animated.Value(0)).current;
  const rarityColor = rarityColors[rarity];

  // Hairline fills in sync with the count-up (same duration + ease-out cubic).
  useEffect(() => {
    if (!countActive || xp === 0) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: XP_COUNT_DURATION,
      easing: motion.easing.decel,
      useNativeDriver: true,
    }).start();
  }, [countActive, xp, progress]);

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

export default function ResultScreen({ route, navigation }: Props): React.JSX.Element {
  const t = useT(C);
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

  // Animation phase — starts at 'flipping', transitions to 'revealed' after flip.
  const [phase, setPhase] = useState<Phase>('flipping');
  const isRevealed = phase === 'revealed';

  // One Animated.Value per staggered reveal group (name, scientific, badges,
  // XP, description, actions).
  const revealAnims = useRef(
    Array.from({ length: REVEAL_GROUPS }, () => new Animated.Value(0)),
  ).current;

  const handleFlipComplete = useCallback(() => {
    // Heavier beat for the top tiers; standard success otherwise.
    if (rarity === 'epic' || rarity === 'legendary') {
      haptics.rare();
    } else {
      haptics.success();
    }
    setPhase('revealed');
  }, [rarity]);

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
          <RarityGlow rarity={rarity} visible={isRevealed} />
          <IdleFloat settled={isRevealed}>
            <FlipCard
              card={card}
              imageUri={publicImageUri}
              onFlipComplete={handleFlipComplete}
            />
          </IdleFloat>
        </View>

        {/* ---- Species name (revealed after the flip) ---- */}
        <Reveal anim={revealAnims[0]!}>
          <Text style={styles.speciesName}>{sighting.commonName}</Text>
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
          <XpBanner xp={sighting.xp} rarity={rarity} countActive={isRevealed} />
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

  /* ---- Species header (below the card, post-reveal) ---- */
  speciesName: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    textAlign: 'center',
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
