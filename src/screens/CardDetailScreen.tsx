/**
 * CardDetailScreen — full-bleed collectible card detail view (modal).
 *
 * Route: RootStackParamList['CardDetail'] — receives { cardId: string }.
 *
 * Layout (top to bottom):
 *   1. Hero — full-bleed card image behind the status bar, bottom scrim,
 *      species name + scientific name over the scrim, grabber handle,
 *      close affordance (chevron-down), rarity badge, share placeholder.
 *   2. Stats — Apple Settings-style hairline-separated 2-column row list.
 *   3. First-discovery banner (conditional).
 *   4. About — description.
 *   5. Discovery metadata — date, fuzzed location snippet, precision note.
 *   6. Safety notes panel (conditional — only for sensitive/protected/captive).
 *   7. Location privacy notice.
 *
 * HARD RULES enforced here:
 * - publicImageUri (AI recreation) is shown; privatePhotoUri is NEVER accessed.
 * - Hidden locations show "Location hidden for species protection" — no coords.
 * - Captive/zoo sightings are tagged explicitly.
 */
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/Button';
import { MockCardImage } from '@/components/MockCardImage';
import { RarityBadge } from '@/components/RarityBadge';
import type { Rarity, Sighting } from '@/domain/types';
import { useLifeDexStore } from '@/store/useLifeDexStore';
import { useLore } from '@/lib/lore';
import {
  colors,
  radius,
  rarityColors,
  scrimGradient,
  spacing,
  typography,
} from '@/theme/theme';
import { haptics } from '@/utils/haptics';
import type { RootStackParamList } from '@/navigation/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Props = NativeStackScreenProps<RootStackParamList, 'CardDetail'>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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

/** A single label/value row in the stats list, Apple Settings-style. */
function StatRow({
  label,
  value,
  valueColor,
  last,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.statRow, !last && styles.statRowDivider]}>
      <Text style={styles.statRowLabel}>{label}</Text>
      <View style={styles.statRowValueWrap}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text
            style={[styles.statRowValue, valueColor ? { color: valueColor } : null]}
            numberOfLines={1}
          >
            {String(value)}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/** Tinted info panel with an Ionicon, used for safety notes + privacy notice. */
function TintPanel({
  icon,
  iconColor,
  tint,
  title,
  titleColor,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  tint: string;
  title?: string;
  titleColor?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.tintPanel, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={18} color={iconColor} style={styles.tintPanelIcon} />
      <View style={styles.tintPanelBody}>
        {title !== undefined && (
          <Text style={[styles.tintPanelTitle, titleColor ? { color: titleColor } : null]}>
            {title}
          </Text>
        )}
        {children}
      </View>
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
  // Species lore (Wikipedia, best-effort). Hook called unconditionally (before any
  // early return); resolves to null offline / when there's no article.
  const { lore, loading: loreLoading } = useLore(
    sighting?.scientificName,
    sighting?.commonName ?? '',
  );
  // Store lookups are synchronous — no loading/error state needed.
  // isFirstDiscovery is not persisted on Sighting (see store notes); default false.
  const isFirstDiscovery = false;

  const handleBack = useCallback(() => {
    haptics.tap();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  /* ── Missing card (not found in store) ── */
  if (sighting === null) {
    return (
      <View style={[styles.root, styles.centred]}>
        <Ionicons name="close-circle-outline" size={40} color={colors.danger} style={styles.errorIcon} />
        <Text style={styles.errorTitle}>Card not found</Text>
        <Text style={styles.errorBody}>No data found for this card.</Text>
        <Button title="Go back" variant="primary" onPress={handleBack} haptic={false} />
      </View>
    );
  }

  const { card, publicLocation, createdAt, confidence, captiveStatus, category } = sighting;
  const rarity: Rarity = sighting.rarity;
  const rarityColor = rarityColors[rarity];
  const isHidden = publicLocation.hidden;
  const isCaptive = captiveStatus === 'zoo_captive' || captiveStatus === 'domestic';

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — full-bleed image behind the status bar ── */}
        <View style={styles.hero}>
          <MockCardImage
            uri={sighting.publicImageUri}
            rarity={rarity}
            category={category}
            name={card.name}
          />

          {/* Scrim for legible text over imagery */}
          <LinearGradient
            colors={[...scrimGradient]}
            style={styles.heroScrim}
            pointerEvents="none"
          />

          {/* Grabber handle */}
          <View style={[styles.grabberWrap, { top: insets.top + spacing.xs }]} pointerEvents="none">
            <View style={styles.grabber} />
          </View>

          {/* Close affordance + rarity + share */}
          <View style={[styles.heroTopBar, { top: insets.top + spacing.md }]}>
            <Pressable
              style={({ pressed }) => [styles.backCircle, pressed && styles.glassCirclePressed]}
              onPress={handleBack}
              hitSlop={12}
              accessibilityLabel="Back"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>

            <View style={styles.heroTopBarRight}>
              <RarityBadge rarity={rarity} />
              <Pressable
                style={({ pressed }) => [styles.glassCircle, pressed && styles.glassCirclePressed]}
                disabled
                accessibilityLabel="Share (coming soon)"
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
              >
                <Ionicons name="share-outline" size={19} color={colors.textDisabled} />
              </Pressable>
            </View>
          </View>

          {/* Identity over the scrim */}
          <View style={styles.heroTextBlock}>
            <Text style={styles.speciesName} numberOfLines={2}>
              {card.name}
            </Text>
            {sighting.scientificName !== undefined && (
              <Text style={styles.scientificName}>{sighting.scientificName}</Text>
            )}
          </View>
        </View>

        {/* ── Content body ── */}
        <View style={styles.body}>

          {/* First-discovery banner */}
          {isFirstDiscovery && (
            <View style={[styles.firstDiscoveryBanner, { borderColor: `${rarityColor}60` }]}>
              <Ionicons name="star" size={20} color={rarityColor} style={styles.firstDiscoveryIcon} />
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

          {isCaptive && (
            <View style={styles.captiveTag}>
              <Text style={styles.captiveTagText}>
                {CAPTIVE_LABEL[captiveStatus] ?? captiveStatus}
              </Text>
            </View>
          )}

          {/* Stats list — Apple Settings pattern */}
          <View style={styles.statsCard}>
            <StatRow
              label="Rarity"
              value={<RarityBadge rarity={rarity} size="sm" />}
            />
            <StatRow
              label="Category"
              value={category.charAt(0).toUpperCase() + category.slice(1)}
            />
            <StatRow
              label="Confidence"
              value={`${Math.round(confidence * 100)}%`}
            />
            <StatRow
              label="XP"
              value={card.xp}
            />
            <StatRow
              label="First discovery"
              value={isFirstDiscovery ? 'Yes' : 'No'}
            />
            <StatRow
              label="Date spotted"
              value={formatDate(createdAt)}
            />
            <StatRow
              label="Location"
              value={
                isHidden
                  ? 'Hidden for species protection'
                  : `${formatLocation(sighting)} · ${precisionLabel(publicLocation.precisionMeters, isHidden)}`
              }
              valueColor={isHidden ? colors.warning : undefined}
              last
            />
          </View>

          {/* About — real species lore (Wikipedia): a reference photo + the full
              intro (multiple paragraphs). The generated blurb is the offline /
              no-article fallback. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            {loreLoading ? (
              <View style={styles.loreLoading}>
                <ActivityIndicator color={colors.textMuted} />
                <Text style={styles.loreLoadingText}>Looking up {card.name}…</Text>
              </View>
            ) : lore !== null ? (
              <>
                {lore.imageUrl !== undefined && (
                  <Image
                    source={{ uri: lore.imageUrl }}
                    style={styles.loreImage}
                    resizeMode="cover"
                    accessibilityLabel={`Reference photo of ${card.name}`}
                  />
                )}
                {lore.summary.split(/\n{2,}/).map((para, i) => (
                  <Text
                    key={i}
                    style={[styles.descriptionText, i > 0 && styles.loreParaSpacing]}
                  >
                    {para.trim()}
                  </Text>
                ))}
                <View style={styles.loreFooter}>
                  <Text style={styles.loreSource}>
                    {lore.description !== undefined
                      ? `${lore.description} · via Wikipedia`
                      : 'via Wikipedia'}
                  </Text>
                  {lore.url !== undefined && (
                    <Pressable
                      onPress={() => {
                        void Linking.openURL(lore.url as string);
                      }}
                      hitSlop={8}
                      accessibilityRole="link"
                      accessibilityLabel="Read more on Wikipedia"
                    >
                      <Text style={styles.loreLink}>Read more →</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : (
              <Text style={styles.descriptionText}>{card.description}</Text>
            )}
          </View>

          {/* Safety notes */}
          {card.safetyNotes !== undefined && card.safetyNotes.length > 0 && (
            <TintPanel
              icon="shield-checkmark-outline"
              iconColor={colors.warning}
              tint={`${colors.warning}1A`}
              title="Safety & Ethics"
              titleColor={colors.warning}
            >
              {card.safetyNotes.map((note, i) => (
                <Text key={i} style={styles.safetyText}>
                  {note}
                </Text>
              ))}
            </TintPanel>
          )}

          {/* Privacy notice */}
          <TintPanel
            icon="location-outline"
            iconColor={colors.textSecondary}
            tint={colors.surface}
          >
            <Text style={styles.privacyText}>
              The image above is an AI recreation — your original photo is stored privately
              and never shared. GPS coordinates are fuzzed per species sensitivity rules.
            </Text>
          </TintPanel>
        </View>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const HERO_HEIGHT = 480;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  scroll: {
    flex: 1,
  },

  /* ── Hero ── */
  hero: {
    height: HERO_HEIGHT,
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    position: 'relative',
  },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  grabberWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.textDisabled,
  },
  heroTopBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  heroTopBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  glassCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Back button — high-contrast dark disc so the arrow is legible over any
   * artwork (light or dark), not the near-invisible translucent glass circle. */
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCirclePressed: {
    opacity: 0.7,
  },
  heroTextBlock: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    gap: spacing.xxs,
  },
  speciesName: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  scientificName: {
    ...typography.callout,
    fontStyle: 'italic',
    color: colors.textTertiary,
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
    marginTop: 2,
  },
  firstDiscoveryText: {
    flex: 1,
    gap: 2,
  },
  firstDiscoveryTitle: {
    ...typography.headline,
  },
  firstDiscoveryBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ── Captive tag ── */
  captiveTag: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.warning}22`,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: `${colors.warning}60`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  captiveTagText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },

  /* ── Stats card (Apple Settings row list) ── */
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  statRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  statRowLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  statRowValueWrap: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  statRowValue: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'right',
  },

  /* ── Sections ── */
  section: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  loreLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loreLoadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  loreImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceElevated,
  },
  loreParaSpacing: {
    marginTop: spacing.sm,
  },
  loreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  loreSource: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  loreLink: {
    ...typography.caption,
    color: colors.teal,
    fontWeight: '600',
  },

  /* ── Tint panels (safety + privacy) ── */
  tintPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tintPanelIcon: {
    marginTop: 2,
  },
  tintPanelBody: {
    flex: 1,
    gap: spacing.xs,
  },
  tintPanelTitle: {
    ...typography.headline,
  },
  safetyText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  privacyText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },

  /* ── States ── */
  errorIcon: {
    marginBottom: spacing.sm,
  },
  errorTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
