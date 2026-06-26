/**
 * ResultScreen — displays an already-created sighting record.
 *
 * Flow:
 *   1. Receives `sightingId` from route params (a real store id, NOT an image URI).
 *   2. Looks up Sighting + CollectionCard synchronously from useLifeDexStore.
 *   3. Reveals the collectible card with a 3-D flip animation + shimmer pass.
 *   4. Counts up XP.
 *   5. "View Collection" navigates to the collection tab (record is already persisted).
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/navigation/types';
import type { CardMetadata, Sighting } from '@/domain/types';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import {
  colors,
  rarityColors,
  spacing,
  radius,
  typography,
} from '@/theme/theme';
import type { Rarity, Category, CaptiveStatus } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Types & constants                                                    */
/* ------------------------------------------------------------------ */

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

/** Pixel dimensions for the card — portrait trading-card ratio. */
const CARD_WIDTH = 280;
const CARD_HEIGHT = 400;

/** Duration of the flip-in animation (ms). */
const FLIP_DURATION = 700;

/** XP count-up duration (ms). */
const XP_COUNT_DURATION = 1400;

const CATEGORY_ICONS: Record<Category, string> = {
  animal: '🐾',
  plant: '🌿',
  tree: '🌳',
  mushroom: '🍄',
  unknown: '❓',
};

const CAPTIVE_LABELS: Record<CaptiveStatus, string | null> = {
  wild: null,
  domestic: 'Domestic',
  zoo_captive: 'Zoo / Captive',
  unknown: null,
};

/** Rarity display names for the badge. */
const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
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
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

/** Shimmering overlay that sweeps across the card face once. */
function CardShimmer({ active }: { active: boolean }) {
  const shimmerX = useRef(new Animated.Value(-CARD_WIDTH)).current;

  useEffect(() => {
    if (!active) return;
    const delay = setTimeout(() => {
      Animated.timing(shimmerX, {
        toValue: CARD_WIDTH * 2,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, FLIP_DURATION + 100);
    return () => clearTimeout(delay);
  }, [active, shimmerX]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        styles.shimmer,
        { transform: [{ translateX: shimmerX }] },
      ]}
    />
  );
}

interface CardFaceProps {
  card: CardMetadata;
  imageUri: string;
  flipped: boolean;
}

/** The visible face of the collectible card. */
function CardFace({ card, imageUri: _imageUri, flipped }: CardFaceProps) {
  const rarityColor = rarityColors[card.rarity];
  const categoryIcon = CATEGORY_ICONS[card.category] ?? '❓';

  return (
    <View style={[styles.cardFace, { borderColor: rarityColor }]}>
      {/* AI-recreation image area */}
      <View style={[styles.cardImageArea, { backgroundColor: colors.surfaceElevated }]}>
        {/* In real mode this would be an <Image source={{ uri: imageUri }} /> */}
        {/* Mock URIs are not network-loadable, so we render a styled placeholder */}
        <Text style={styles.cardImagePlaceholderIcon}>{categoryIcon}</Text>
        <Text style={styles.cardImagePlaceholderLabel} numberOfLines={1}>
          {card.name}
        </Text>
        {/* Subtle rarity glow strip at bottom of image */}
        <View style={[styles.cardImageGlow, { backgroundColor: rarityColor + '40' }]} />
      </View>

      {/* Card info panel */}
      <View style={styles.cardInfo}>
        {/* Header row: name + rarity badge */}
        <View style={styles.cardInfoHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {card.name}
          </Text>
          <View style={[styles.rarityBadge, { backgroundColor: rarityColor + '22', borderColor: rarityColor }]}>
            <Text style={[styles.rarityBadgeText, { color: rarityColor }]}>
              {RARITY_LABELS[card.rarity]}
            </Text>
          </View>
        </View>

        {/* Category line */}
        <Text style={styles.cardCategory}>
          {categoryIcon} {card.category.charAt(0).toUpperCase() + card.category.slice(1)}
        </Text>

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

/** Rotating card back face. */
function CardBack() {
  return (
    <View style={[styles.cardFace, styles.cardBack]}>
      <Text style={styles.cardBackLogo}>LifeDex</Text>
      <Text style={styles.cardBackSub}>Nature Collected</Text>
    </View>
  );
}

interface FlipCardProps {
  card: CardMetadata;
  imageUri: string;
  onFlipComplete: () => void;
}

/** Flip-in animation container — starts showing back, flips to reveal face. */
function FlipCard({ card, imageUri, onFlipComplete }: FlipCardProps) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [showFront, setShowFront] = useState(false);

  useEffect(() => {
    // Brief delay so the screen content settles first
    const t = setTimeout(() => {
      Animated.timing(flipAnim, {
        toValue: 180,
        duration: FLIP_DURATION,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFlipComplete();
      });
    }, 300);
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
/* Captive / status badge row                                         */
/* ------------------------------------------------------------------ */

function StatusBadges({ sighting }: { sighting: Sighting }) {
  const captiveLabel = CAPTIVE_LABELS[sighting.captiveStatus];

  return (
    <View style={styles.badgeRow}>
      {/* Wild / Domestic / Zoo badge */}
      {captiveLabel !== null ? (
        <View style={[styles.badge, { backgroundColor: colors.warning + '22', borderColor: colors.warning }]}>
          <Text style={[styles.badgeText, { color: colors.warning }]}>{captiveLabel}</Text>
        </View>
      ) : (
        <View style={[styles.badge, { backgroundColor: colors.success + '22', borderColor: colors.success }]}>
          <Text style={[styles.badgeText, { color: colors.success }]}>Wild</Text>
        </View>
      )}

      {/* Sensitivity badge */}
      {(sighting.sensitivity === 'sensitive' || sighting.sensitivity === 'protected') && (
        <View style={[styles.badge, { backgroundColor: colors.danger + '22', borderColor: colors.danger }]}>
          <Text style={[styles.badgeText, { color: colors.danger }]}>
            {sighting.sensitivity === 'protected' ? 'Protected Species' : 'Sensitive'}
          </Text>
        </View>
      )}

      {/* Moderation blocked badge */}
      {!sighting.moderation.allowed && (
        <View style={[styles.badge, { backgroundColor: colors.danger + '22', borderColor: colors.danger }]}>
          <Text style={[styles.badgeText, { color: colors.danger }]}>Blocked</Text>
        </View>
      )}

      {/* Confidence */}
      <View style={[styles.badge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
          {Math.round(sighting.confidence * 100)}% match
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Location note                                                       */
/* ------------------------------------------------------------------ */

function LocationNote({ sighting }: { sighting: Sighting }) {
  if (sighting.publicLocation.hidden) {
    return (
      <View style={styles.locationNote}>
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>
          📍 Location hidden (protected species)
        </Text>
      </View>
    );
  }
  const precisionKm = (sighting.publicLocation.precisionMeters / 1000).toFixed(1);
  if (sighting.publicLocation.precisionMeters > 0) {
    return (
      <View style={styles.locationNote}>
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>
          📍 Location fuzzed to ~{precisionKm} km
        </Text>
      </View>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Safety notes                                                        */
/* ------------------------------------------------------------------ */

function SafetyNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <View style={styles.safetyBox}>
      <Text style={styles.safetyTitle}>Conservation Notice</Text>
      {notes.map((note, i) => (
        <Text key={i} style={styles.safetyNote}>
          {'• '}{note}
        </Text>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* XP Banner                                                          */
/* ------------------------------------------------------------------ */

function XpBanner({
  xp,
  rarity,
  scoreReason,
  countActive,
}: {
  xp: number;
  rarity: Rarity;
  scoreReason: string;
  countActive: boolean;
}) {
  const displayed = useXpCountUp(xp, XP_COUNT_DURATION, countActive);
  const rarityColor = rarityColors[rarity];

  return (
    <View style={styles.xpSection}>
      <View style={styles.xpBanner}>
        <Text style={[styles.xpValue, { color: rarityColor }]}>+{displayed}</Text>
        <Text style={styles.xpLabel}>XP</Text>
      </View>
      <Text style={styles.scoreReason}>{scoreReason}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

type Phase = 'flipping' | 'revealed';

export default function ResultScreen({ route, navigation }: Props) {
  const { sightingId } = route.params;

  // Synchronous store lookup — no async, no pipeline.
  const { getSightingById, getCardById } = useLifeDexStore();
  const sighting = getSightingById(sightingId);

  // Derive CollectionCard from store (card id mirrors sightingId by convention).
  const cardId = `card-${sightingId}`;
  const collectionCard = getCardById(cardId);

  // Animation phase — starts at 'flipping', transitions to 'revealed' after flip.
  const [phase, setPhase] = useState<Phase>('flipping');

  const handleFlipComplete = useCallback(() => {
    setPhase('revealed');
  }, []);

  const handleGoCollection = useCallback(() => {
    navigation.navigate('Tabs', { screen: 'Collection' });
  }, [navigation]);

  const handleRetry = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  /* ---- Render: record not found ---- */
  if (sighting === undefined) {
    return (
      <View style={styles.centeredFill}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorTitle}>Sighting Not Found</Text>
        <Text style={styles.errorMessage}>
          This sighting record could not be loaded. It may not have been saved yet.
        </Text>
        <Pressable style={styles.primaryButton} onPress={handleRetry}>
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Use card from the sighting row directly (always present per Sighting schema).
  // Fall back to collectionCard if available (same data, either works).
  const card = collectionCard?.card ?? sighting.card;
  const publicImageUri = collectionCard?.publicImageUri ?? sighting.publicImageUri;
  const rarity = collectionCard?.rarity ?? sighting.rarity;
  const rarityColor = rarityColors[rarity];
  const isRevealed = phase === 'revealed';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Rarity glow backdrop */}
      <View
        style={[
          styles.glowBackdrop,
          { backgroundColor: isRevealed ? rarityColor + '18' : 'transparent' },
        ]}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Species name ---- */}
        <Text style={styles.speciesName}>{sighting.commonName}</Text>
        {sighting.scientificName !== undefined && (
          <Text style={styles.scientificName}>{sighting.scientificName}</Text>
        )}

        {/* ---- Status badges ---- */}
        <StatusBadges sighting={sighting} />

        {/* ---- Location note ---- */}
        <LocationNote sighting={sighting} />

        {/* ---- Card flip ---- */}
        <View style={styles.cardWrapper}>
          <FlipCard
            card={card}
            imageUri={publicImageUri}
            onFlipComplete={handleFlipComplete}
          />
        </View>

        {/* ---- XP Banner (fades in after reveal) ---- */}
        <Animated.View style={[{ opacity: isRevealed ? 1 : 0 }]}>
          <XpBanner
            xp={sighting.xp}
            rarity={rarity}
            scoreReason={card.description}
            countActive={isRevealed}
          />
        </Animated.View>

        {/* ---- Safety notes (if any) ---- */}
        {isRevealed && card.safetyNotes !== undefined && card.safetyNotes.length > 0 && (
          <SafetyNotes notes={card.safetyNotes} />
        )}

        {/* ---- Card description ---- */}
        {isRevealed && (
          <View style={styles.descriptionBox}>
            <Text style={styles.descriptionText}>{card.description}</Text>
          </View>
        )}

        {/* ---- Action buttons ---- */}
        {isRevealed && (
          <View style={styles.actions}>
            {/* Record is already persisted by the pipeline — go straight to collection. */}
            <Pressable
              style={[styles.primaryButton, styles.savedButton]}
              onPress={handleGoCollection}
              accessibilityRole="button"
              accessibilityLabel="View collection"
            >
              <Text style={[styles.primaryButtonText, { color: colors.success }]}>
                View Collection →
              </Text>
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Capture another"
            >
              <Text style={styles.secondaryButtonText}>Capture Another</Text>
            </Pressable>
          </View>
        )}

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
  glowBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  scroll: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? spacing.xxl + spacing.md : spacing.xl,
    paddingHorizontal: spacing.md,
  },

  /* ---- Error / empty ---- */
  centeredFill: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorIcon: {
    fontSize: 48,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  errorTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },

  /* ---- Species header ---- */
  speciesName: {
    ...typography.display,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  scientificName: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  /* ---- Status badges ---- */
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeText: {
    ...typography.label,
    letterSpacing: 0.5,
  },

  /* ---- Location note ---- */
  locationNote: {
    marginBottom: spacing.xl,
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

  /* ---- Card face ---- */
  cardFace: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    // Elevation for Android
    elevation: 12,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  cardBack: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardBackLogo: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.teal,
    letterSpacing: 2,
  },
  cardBackSub: {
    ...typography.caption,
    color: colors.textMuted,
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
  cardImagePlaceholderIcon: {
    fontSize: 72,
    marginBottom: spacing.xs,
  },
  cardImagePlaceholderLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
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
    ...typography.heading,
    color: colors.textPrimary,
    flex: 1,
  },
  rarityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  rarityBadgeText: {
    ...typography.label,
    letterSpacing: 0.4,
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
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* ---- Shimmer ---- */
  shimmer: {
    width: CARD_WIDTH * 0.4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ skewX: '-15deg' }],
  },

  /* ---- XP section ---- */
  xpSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  xpBanner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  xpValue: {
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 64,
  },
  xpLabel: {
    ...typography.title,
    color: colors.textSecondary,
  },
  scoreReason: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* ---- Safety notes ---- */
  safetyBox: {
    width: '100%',
    backgroundColor: colors.danger + '12',
    borderWidth: 1,
    borderColor: colors.danger + '44',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  safetyTitle: {
    ...typography.label,
    color: colors.danger,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  safetyNote: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
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
    lineHeight: 24,
  },

  /* ---- Actions ---- */
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.teal,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  savedButton: {
    borderColor: colors.success,
  },
  primaryButtonText: {
    ...typography.heading,
    color: colors.teal,
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
