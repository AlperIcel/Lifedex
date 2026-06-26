/**
 * CardView — the primary collectible card UI for LifeDex.
 *
 * Visual hierarchy (top → bottom):
 *  1. Card image (AI recreation, never the original photo)
 *  2. Category chip + sensitivity indicator
 *  3. Common name + scientific name
 *  4. Rarity badge + XP ring in a row
 *  5. Stats grid
 *  6. Safety notes (if any)
 *  7. Confidence bar
 *
 * Sizing: defaults to a portrait trading-card ratio (2.5 : 3.5 ≈ 0.714).
 * Pass `compact` to render a shorter thumbnail variant for list/grid views.
 *
 * The card never shows the private photo URI or exact GPS. Both are stripped
 * before the component receives a sighting — it only consumes the public fields.
 */
import React, { useCallback } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import type { Category, Rarity, Sighting } from '@/domain/types';
import { colors, rarityColors, spacing, radius, typography } from '@/theme/theme';
import { RarityBadge } from './RarityBadge';
import { XPRing } from './XPRing';

/* ------------------------------------------------------------------ */
/* Category label + emoji                                               */
/* ------------------------------------------------------------------ */

const CATEGORY_META: Record<Category, { label: string; emoji: string }> = {
  animal: { label: 'Animal', emoji: '🐾' },
  plant: { label: 'Plant', emoji: '🌿' },
  tree: { label: 'Tree', emoji: '🌳' },
  mushroom: { label: 'Mushroom', emoji: '🍄' },
  unknown: { label: 'Unknown', emoji: '❓' },
};

/* ------------------------------------------------------------------ */
/* Sensitivity dot                                                       */
/* ------------------------------------------------------------------ */

const SENSITIVITY_COLOR: Record<string, string> = {
  none: colors.textMuted,
  low: colors.success,
  sensitive: colors.warning,
  protected: colors.danger,
};

const SENSITIVITY_LABEL: Record<string, string> = {
  none: '',
  low: 'Low sensitivity',
  sensitive: 'Sensitive species',
  protected: 'Protected species',
};

/* ------------------------------------------------------------------ */
/* Stat row helper                                                       */
/* ------------------------------------------------------------------ */

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): React.JSX.Element {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {String(value)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */

interface Props {
  sighting: Sighting;
  /** Compact mode for list/grid — hides stats and safety notes. */
  compact?: boolean;
  /** Called when the card is pressed. */
  onPress?: () => void;
  /** Extra style on the outer container. */
  style?: ViewStyle;
}

/* ------------------------------------------------------------------ */
/* CardView                                                              */
/* ------------------------------------------------------------------ */

export function CardView({ sighting, compact = false, onPress, style }: Props): React.JSX.Element {
  const { card, publicImageUri, rarity, category, commonName, scientificName, confidence, sensitivity } = sighting;

  const accentColor = rarityColors[rarity as Rarity];
  const catMeta = CATEGORY_META[category] ?? CATEGORY_META.unknown;
  const sensitivityColor = SENSITIVITY_COLOR[sensitivity] ?? colors.textMuted;
  const sensitivityLabel = SENSITIVITY_LABEL[sensitivity] ?? '';

  // Confidence bar width as a percentage
  const confPct = Math.round(confidence * 100);

  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      style={({ pressed }) => [
        styles.card,
        { borderColor: accentColor },
        pressed && styles.cardPressed,
        style,
      ]}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={`${commonName} card, ${rarity} rarity, ${sighting.xp} XP`}
    >
      {/* Subtle rarity glow overlay at the top edge */}
      <View style={[styles.glowBar, { backgroundColor: accentColor }]} />

      {/* ── Card image ──────────────────────────────────────────── */}
      <View style={[styles.imageWrapper, compact && styles.imageWrapperCompact]}>
        {publicImageUri ? (
          <Image
            source={{ uri: publicImageUri }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={`AI illustration of ${commonName}`}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderEmoji}>{catMeta.emoji}</Text>
          </View>
        )}
        {/* Category chip — overlay bottom-left of image */}
        <View style={styles.categoryChip}>
          <Text style={styles.categoryChipText}>
            {catMeta.emoji} {catMeta.label.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────── */}
      <View style={styles.body}>
        {/* Name block */}
        <View style={styles.nameBlock}>
          <Text style={styles.commonName} numberOfLines={2}>
            {commonName}
          </Text>
          {scientificName ? (
            <Text style={styles.scientificName} numberOfLines={1}>
              {scientificName}
            </Text>
          ) : null}
        </View>

        {/* Rarity + XP row */}
        <View style={styles.rarityRow}>
          <RarityBadge rarity={rarity} size={compact ? 'sm' : 'md'} />
          <XPRing xp={sighting.xp} rarity={rarity} size={compact ? 44 : 56} />
        </View>

        {/* Sensitivity indicator */}
        {sensitivity !== 'none' ? (
          <View style={styles.sensitivityRow}>
            <View style={[styles.sensitivityDot, { backgroundColor: sensitivityColor }]} />
            <Text style={[styles.sensitivityText, { color: sensitivityColor }]}>
              {sensitivityLabel}
            </Text>
          </View>
        ) : null}

        {/* Stats grid — hidden in compact mode */}
        {!compact && Object.keys(card.stats).length > 0 ? (
          <View style={styles.statsSection}>
            <View style={[styles.divider, { borderColor: `${accentColor}40` }]} />
            {Object.entries(card.stats).map(([k, v]) => (
              <StatRow key={k} label={k} value={v} />
            ))}
          </View>
        ) : null}

        {/* Confidence bar */}
        {!compact ? (
          <View style={styles.confSection}>
            <View style={styles.confHeader}>
              <Text style={styles.confLabel}>ID Confidence</Text>
              <Text style={[styles.confPct, { color: accentColor }]}>{confPct}%</Text>
            </View>
            <View style={styles.confTrack}>
              <View
                style={[
                  styles.confFill,
                  { width: `${confPct}%` as `${number}%`, backgroundColor: accentColor },
                ]}
              />
            </View>
          </View>
        ) : null}

        {/* Safety notes — hidden in compact mode */}
        {!compact && card.safetyNotes && card.safetyNotes.length > 0 ? (
          <View style={styles.safetySection}>
            <View style={[styles.divider, { borderColor: `${colors.warning}40` }]} />
            {card.safetyNotes.map((note, i) => (
              <Text key={i} style={styles.safetyNote}>
                {'⚠ '}{note}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {/* Captive / zoo watermark */}
      {sighting.captiveStatus !== 'wild' && sighting.captiveStatus !== 'unknown' ? (
        <View style={styles.captiveBanner}>
          <Text style={styles.captiveBannerText}>
            {sighting.captiveStatus === 'zoo_captive' ? 'ZOO / CAPTIVE' : 'DOMESTIC'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const CARD_RADIUS = radius.lg;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  glowBar: {
    height: 3,
    opacity: 0.9,
  },
  /* Image */
  imageWrapper: {
    height: 220,
    backgroundColor: colors.surfaceElevated,
  },
  imageWrapperCompact: {
    height: 140,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  imagePlaceholderEmoji: {
    fontSize: 56,
  },
  categoryChip: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  categoryChipText: {
    ...typography.label,
    color: colors.textPrimary,
    letterSpacing: 0.8,
  },
  /* Body */
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  nameBlock: {
    gap: 2,
  },
  commonName: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  scientificName: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  /* Rarity + XP */
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /* Sensitivity */
  sensitivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sensitivityDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  sensitivityText: {
    ...typography.caption,
    fontWeight: '600',
  },
  /* Stats */
  statsSection: {
    gap: spacing.xs,
  },
  divider: {
    borderTopWidth: 1,
    marginVertical: spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
    marginRight: spacing.xs,
  },
  statValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'right',
  },
  /* Confidence */
  confSection: {
    gap: spacing.xs,
  },
  confHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confLabel: {
    ...typography.label,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  confPct: {
    ...typography.label,
    fontWeight: '700',
  },
  confTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  confFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  /* Safety notes */
  safetySection: {
    gap: spacing.xs,
  },
  safetyNote: {
    ...typography.caption,
    color: colors.warning,
    lineHeight: 18,
  },
  /* Captive banner */
  captiveBanner: {
    backgroundColor: 'rgba(232,163,61,0.18)',
    borderTopWidth: 1,
    borderTopColor: `${colors.amber}55`,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  captiveBannerText: {
    ...typography.label,
    color: colors.amber,
    letterSpacing: 2,
  },
});
