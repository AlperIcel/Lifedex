/**
 * CardDetailScreen — full-bleed collectible card detail view.
 *
 * Route: RootStackParamList['CardDetail'] — receives { cardId: string }.
 *
 * Layout (top to bottom):
 *   1. Hero card image (AI recreation, NOT original photo) with rarity glow.
 *   2. Header bar — back button + share placeholder.
 *   3. Card identity — name, scientific name, category chip, rarity badge.
 *   4. XP ring + stat grid (confidence, category, captive status).
 *   5. First-discovery banner (conditional).
 *   6. Discovery metadata — date, fuzzed location snippet, precision note.
 *   7. Safety notes panel (conditional — only for sensitive/protected/captive).
 *   8. Location privacy notice.
 *
 * HARD RULES enforced here:
 * - publicImageUri (AI recreation) is shown; privatePhotoUri is NEVER accessed.
 * - Hidden locations show "Location hidden for species protection" — no coords.
 * - Captive/zoo sightings are tagged explicitly.
 */
import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RarityBadge } from '@/components/RarityBadge';
import { XPRing } from '@/components/XPRing';
import type { Rarity, Sighting } from '@/domain/types';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import {
  colors,
  radius,
  rarityColors,
  spacing,
  typography,
} from '@/theme/theme';
import type { RootStackParamList } from '@/navigation/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Props = NativeStackScreenProps<RootStackParamList, 'CardDetail'>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<string, string> = {
  animal: '🐾',
  plant: '🌿',
  tree: '🌲',
  mushroom: '🍄',
  unknown: '❓',
};

const CAPTIVE_LABEL: Record<string, string> = {
  wild: 'Wild',
  domestic: 'Domestic',
  zoo_captive: 'Zoo / Captive',
  unknown: 'Unknown',
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatLocation(sighting: Sighting): string {
  if (sighting.publicLocation.hidden) return 'hidden';
  const { lat, lng } = sighting.publicLocation;
  const latStr = `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
}

function precisionLabel(meters: number, hidden: boolean): string {
  if (hidden) return 'Exact location protected';
  if (meters >= 5000) return `±${(meters / 1000).toFixed(0)} km radius`;
  if (meters >= 1000) return `±${(meters / 1000).toFixed(1)} km radius`;
  return `±${meters} m radius`;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

/** Gradient-bordered card image frame with rarity glow. */
function CardFrame({
  rarity,
  imageUri,
}: {
  rarity: Rarity;
  imageUri: string;
}) {
  const glowColor = rarityColors[rarity];

  // Placeholder image: colored panel with card URI shown (mock mode has no real image)
  const isMock = imageUri.startsWith('mock-card://');

  return (
    <View style={[styles.cardFrame, { shadowColor: glowColor }]}>
      {/* Outer glow border */}
      <View
        style={[
          styles.cardBorder,
          { borderColor: `${glowColor}60` },
        ]}
      >
        {/* Inner surface */}
        <View style={styles.cardInner}>
          {isMock ? (
            <MockCardPlaceholder rarity={rarity} imageUri={imageUri} />
          ) : (
            // Real mode: swap this for <Image source={{ uri: imageUri }} ... />
            <View style={[styles.imagePlaceholder, { backgroundColor: `${glowColor}18` }]} />
          )}
          {/* Rarity sheen overlay */}
          <View
            style={[
              styles.raritySheen,
              { backgroundColor: `${glowColor}0A` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

/** Visual placeholder used in mock mode — shows the species slug decoded from URI. */
function MockCardPlaceholder({
  rarity,
  imageUri,
}: {
  rarity: Rarity;
  imageUri: string;
}) {
  const glowColor = rarityColors[rarity];
  // Parse mock-card://<category>/<slug>/<rarity>/<xp>
  const parts = imageUri.replace('mock-card://', '').split('/');
  const category = parts[0] ?? 'unknown';
  const slug = (parts[1] ?? 'specimen').replace(/-/g, ' ');
  const icon = CATEGORY_ICON[category] ?? '❓';

  return (
    <View style={[styles.mockPlaceholder, { backgroundColor: `${glowColor}12` }]}>
      {/* Decorative corner marks — collectible card aesthetic */}
      <Text style={[styles.cornerMark, styles.cornerTL, { color: `${glowColor}50` }]}>◆</Text>
      <Text style={[styles.cornerMark, styles.cornerTR, { color: `${glowColor}50` }]}>◆</Text>
      <Text style={[styles.cornerMark, styles.cornerBL, { color: `${glowColor}50` }]}>◆</Text>
      <Text style={[styles.cornerMark, styles.cornerBR, { color: `${glowColor}50` }]}>◆</Text>

      {/* Hexagonal scan-lines texture (drawn in-place) */}
      <View style={styles.scanlineLayer} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.scanline,
              { top: i * 30, borderTopColor: `${glowColor}0D` },
            ]}
          />
        ))}
      </View>

      {/* Centre content */}
      <View style={styles.mockCenter}>
        <Text style={[styles.mockIcon, { textShadowColor: glowColor, textShadowRadius: 18 }]}>
          {icon}
        </Text>
        <Text style={[styles.mockSlug, { color: glowColor }]}>
          {slug.replace(/\b\w/g, (c) => c.toUpperCase())}
        </Text>
        <Text style={styles.mockNote}>AI Recreation</Text>
      </View>
    </View>
  );
}

/** Single stat cell used in the grid. */
function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {String(value)}
      </Text>
    </View>
  );
}

/** Horizontal divider. */
function Divider() {
  return <View style={styles.divider} />;
}

/** Collapsible safety note item. */
function SafetyNote({ note }: { note: string }) {
  return (
    <View style={styles.safetyRow}>
      <Text style={styles.safetyBullet}>⚠</Text>
      <Text style={styles.safetyText}>{note}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

export function CardDetailScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const insets = useSafeAreaInsets();
  const { getCardById, getSightingById } = useLifeDexStore();

  const collectionCard = getCardById(cardId);
  const sighting: Sighting | null =
    collectionCard !== undefined
      ? (getSightingById(collectionCard.sightingId) ?? null)
      : null;
  // Store lookups are synchronous — no loading/error state needed.
  // isFirstDiscovery is not persisted on Sighting (see store notes); default false.
  const isFirstDiscovery = false;

  // Scroll-driven header opacity
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  /* ── Missing card (not found in store) ── */
  if (sighting === null) {
    return (
      <View style={[styles.root, styles.centred]}>
        <Text style={styles.errorIcon}>✕</Text>
        <Text style={styles.errorTitle}>Card not found</Text>
        <Text style={styles.errorBody}>No data found for this card.</Text>
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const { card, publicLocation, createdAt, confidence, captiveStatus, category } = sighting;
  const rarity = sighting.rarity;
  const rarityColor = rarityColors[rarity];
  const isHidden = publicLocation.hidden;
  const isCaptive = captiveStatus === 'zoo_captive' || captiveStatus === 'domestic';

  return (
    <View style={styles.root}>
      {/* ── Sticky header (appears on scroll) ── */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top, opacity: headerOpacity },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.stickyHeaderInner}>
          <Text style={styles.stickyTitle} numberOfLines={1}>
            {card.name}
          </Text>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        {/* ── Back button (floating above card image) ── */}
        <View style={[styles.floatingBar, { top: insets.top + spacing.sm }]}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={handleBack}
            hitSlop={12}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.iconBtnText}>‹</Text>
          </Pressable>

          {/* Rarity tag top-right */}
          <RarityBadge rarity={rarity} />
        </View>

        {/* ── Hero card image ── */}
        <CardFrame rarity={rarity} imageUri={sighting.publicImageUri} />

        {/* ── Content body ── */}
        <View style={styles.body}>

          {/* First-discovery banner */}
          {isFirstDiscovery && (
            <View style={[styles.firstDiscoveryBanner, { borderColor: `${rarityColor}60` }]}>
              <Text style={styles.firstDiscoveryIcon}>★</Text>
              <View style={styles.firstDiscoveryText}>
                <Text style={[styles.firstDiscoveryTitle, { color: rarityColor }]}>
                  First Discovery!
                </Text>
                <Text style={styles.firstDiscoveryBody}>
                  You're the first to find this species. +50 bonus XP awarded.
                </Text>
              </View>
            </View>
          )}

          {/* Name + identity */}
          <View style={styles.identityBlock}>
            <View style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>
                {CATEGORY_ICON[category]} {category.charAt(0).toUpperCase() + category.slice(1)}
              </Text>
            </View>

            <Text style={styles.speciesName}>{card.name}</Text>

            {sighting.scientificName !== undefined && (
              <Text style={styles.scientificName}>{sighting.scientificName}</Text>
            )}

            {isCaptive && (
              <View style={styles.captiveTag}>
                <Text style={styles.captiveTagText}>
                  {captiveStatus === 'zoo_captive' ? '🏛 Zoo / Captive' : '🏠 Domestic'}
                </Text>
              </View>
            )}
          </View>

          <Divider />

          {/* XP ring + stat grid */}
          <View style={styles.scoreRow}>
            <XPRing xp={card.xp} rarity={rarity} size={96} progress={1} />

            <View style={styles.statGrid}>
              <StatCell
                label="Rarity"
                value={rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                accent={rarityColor}
              />
              <StatCell
                label="Confidence"
                value={`${Math.round(confidence * 100)}%`}
              />
              <StatCell
                label="Status"
                value={CAPTIVE_LABEL[captiveStatus] ?? captiveStatus}
                accent={isCaptive ? colors.warning : undefined}
              />
              <StatCell
                label="Category"
                value={category.charAt(0).toUpperCase() + category.slice(1)}
              />
            </View>
          </View>

          <Divider />

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descriptionText}>{card.description}</Text>
          </View>

          <Divider />

          {/* Discovery metadata */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Discovery</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaIcon}>📅</Text>
              <View style={styles.metaContent}>
                <Text style={styles.metaLabel}>Date spotted</Text>
                <Text style={styles.metaValue}>{formatDate(createdAt)}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaIcon}>📍</Text>
              <View style={styles.metaContent}>
                <Text style={styles.metaLabel}>Location</Text>
                {isHidden ? (
                  <Text style={[styles.metaValue, styles.hiddenLocation]}>
                    Hidden for species protection
                  </Text>
                ) : (
                  <>
                    <Text style={styles.metaValue}>{formatLocation(sighting)}</Text>
                    <Text style={styles.metaPrecision}>
                      {precisionLabel(publicLocation.precisionMeters, isHidden)}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Safety notes */}
          {card.safetyNotes !== undefined && card.safetyNotes.length > 0 && (
            <>
              <Divider />
              <View style={[styles.section, styles.safetySection]}>
                <Text style={[styles.sectionTitle, { color: colors.warning }]}>
                  Safety & Ethics
                </Text>
                {card.safetyNotes.map((note, i) => (
                  <SafetyNote key={i} note={note} />
                ))}
              </View>
            </>
          )}

          <Divider />

          {/* Privacy notice */}
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              The image above is an AI recreation — your original photo is stored privately
              and never shared. GPS coordinates are fuzzed per species sensitivity rules.
            </Text>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CARD_HEIGHT = 420;
const CARD_MARGIN_H = spacing.md;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Sticky header ── */
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stickyHeaderInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stickyTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },

  /* ── Floating action bar over card image ── */
  floatingBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    opacity: 0.7,
  },
  iconBtnText: {
    color: colors.textPrimary,
    fontSize: 26,
    lineHeight: 30,
    marginTop: Platform.OS === 'ios' ? -2 : 0,
  },

  /* ── Card image frame ── */
  scroll: {
    flex: 1,
  },
  cardFrame: {
    marginHorizontal: CARD_MARGIN_H,
    marginTop: spacing.xxl + spacing.lg,
    marginBottom: 0,
    borderRadius: radius.lg,
    // Glow — works on iOS; Android elevation used as fallback
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0.5,
    elevation: 12,
  },
  cardBorder: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardInner: {
    height: CARD_HEIGHT,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
  },
  raritySheen: {
    ...StyleSheet.absoluteFillObject,
  },

  /* ── Mock placeholder ── */
  mockPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerMark: {
    position: 'absolute',
    fontSize: 12,
  },
  cornerTL: { top: spacing.md, left: spacing.md },
  cornerTR: { top: spacing.md, right: spacing.md },
  cornerBL: { bottom: spacing.md, left: spacing.md },
  cornerBR: { bottom: spacing.md, right: spacing.md },
  scanlineLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
  },
  mockCenter: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  mockIcon: {
    fontSize: 80,
    textShadowOffset: { width: 0, height: 0 },
  },
  mockSlug: {
    ...typography.title,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  mockNote: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  /* ── Body content ── */
  body: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },

  /* ── First-discovery banner ── */
  firstDiscoveryBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  firstDiscoveryIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  firstDiscoveryText: {
    flex: 1,
    gap: 2,
  },
  firstDiscoveryTitle: {
    ...typography.heading,
  },
  firstDiscoveryBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ── Identity block ── */
  identityBlock: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  categoryChipText: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  speciesName: {
    ...typography.display,
    color: colors.textPrimary,
  },
  scientificName: {
    ...typography.body,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  captiveTag: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.warning}22`,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: `${colors.warning}60`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  captiveTagText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },

  /* ── Score row ── */
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  statGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statCell: {
    width: '46%',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '700',
  },

  /* ── Divider ── */
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },

  /* ── Sections ── */
  section: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },

  /* ── Discovery meta ── */
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metaIcon: {
    fontSize: 18,
    marginTop: 2,
    width: 24,
    textAlign: 'center',
  },
  metaContent: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  hiddenLocation: {
    color: colors.warning,
    fontStyle: 'italic',
  },
  metaPrecision: {
    ...typography.caption,
    color: colors.textMuted,
  },

  /* ── Safety notes ── */
  safetySection: {
    backgroundColor: `${colors.warning}0F`,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.warning}30`,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  safetyBullet: {
    fontSize: 15,
    color: colors.warning,
    marginTop: 2,
    width: 20,
    textAlign: 'center',
  },
  safetyText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },

  /* ── Privacy notice ── */
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  privacyIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  privacyText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },

  /* ── States ── */
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  errorIcon: {
    fontSize: 40,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  errorTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  backBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  backBtnText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '700',
  },
});
