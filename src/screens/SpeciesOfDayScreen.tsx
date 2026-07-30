/**
 * SpeciesOfDayScreen — informational Species-of-the-Day screen.
 *
 * IMPORTANT: this is NOT a capture flow. It used to be that tapping the
 * Species-of-Day row on Home opened the camera (a "go catch this" prompt).
 * That was confusing — you can't reliably "go catch" a specific wild species
 * on demand. This screen replaces that with a picture + lore + rarity/category
 * info card: something to learn from, not a task to complete.
 *
 * Route: RootStackParamList['SpeciesOfDay'] — receives
 * { name, scientificName?, rarity, category } (see HomeScreen's speciesToday,
 * sourced from src/domain/dailyQuests.ts's speciesOfTheDay()).
 *
 * Layout (top to bottom):
 *   1. Back button (navigation.goBack(), same behaviour as CardDetailScreen's
 *      back affordance).
 *   2. Short intro line ("Today's species to learn about").
 *   3. Big reference image from useLore(scientificName, name).lore?.imageUrl,
 *      with the same loading / found / not-found branching as
 *      CardDetailScreen's "About" block — adapted with a category-icon
 *      placeholder for the not-found case (CardDetail falls back to a
 *      generated description there; this screen has no such fallback since
 *      it isn't tied to a Sighting).
 *   4. Common name (large) + scientific name (italic, secondary).
 *   5. RarityBadge + localized category label.
 *   6. Lore summary paragraphs + "read more on Wikipedia" link (copied from
 *      CardDetailScreen's About block: same `.split(/\n{2,}/)` pattern).
 *
 * Privacy: only the species NAME is sent to Wikipedia via useLore — never
 * user data, photos, or location. No location/photo is added here.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { RarityBadge } from '@/components/RarityBadge';
import type { Category } from '@/domain/types';
import { useLore } from '@/lib/lore';
import { useT, useCommon } from '@/i18n';
import {
  colors,
  gutter,
  radius,
  rarityColors,
  rarityTints,
  spacing,
  typography,
} from '@/theme/theme';
import { haptics } from '@/utils/haptics';
import type { RootStackParamList } from '@/navigation/types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Props = NativeStackScreenProps<RootStackParamList, 'SpeciesOfDay'>;

/* ------------------------------------------------------------------ */
/* i18n catalog                                                        */
/* ------------------------------------------------------------------ */

const C = {
  en: {
    back: 'Back',
    intro: "Today's species to learn about",
    lookingUp: 'Looking up {name}…',
    readMore: 'Read more →',
    readMoreA11y: 'Read more on Wikipedia',
    viaWikipedia: 'via Wikipedia',
    noLore: 'No further information available yet.',
    referencePhotoA11y: 'Reference photo of {name}',
  },
  de: {
    back: 'Zurück',
    intro: 'Heutige Art zum Kennenlernen',
    lookingUp: 'Suche nach {name} …',
    readMore: 'Mehr erfahren →',
    readMoreA11y: 'Mehr auf Wikipedia lesen',
    viaWikipedia: 'über Wikipedia',
    noLore: 'Noch keine weiteren Informationen verfügbar.',
    referencePhotoA11y: 'Referenzfoto von {name}',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Category icons — this screen owns its own icon lookup by stable id, */
/* same convention as HomeScreen's CATEGORY_ICON / dailyQuests.ts's     */
/* domain-layer-stays-string-free rule.                                */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  animal: 'paw-outline',
  plant: 'flower-outline',
  tree: 'leaf-outline',
  mushroom: 'nutrition-outline',
  unknown: 'help-outline',
};

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

export function SpeciesOfDayScreen({ route, navigation }: Props): React.JSX.Element {
  const { name, scientificName, rarity, category } = route.params;
  const t = useT(C);
  const common = useCommon();
  // Species lore (Wikipedia, best-effort). Hook called unconditionally;
  // resolves to null offline / when there's no article. Only the species name
  // is ever sent — see useLore's privacy note.
  const { lore, loading } = useLore(scientificName, name);

  const rarityColor = rarityColors[rarity];
  const categoryIcon = CATEGORY_ICON[category];

  const handleBack = useCallback(() => {
    haptics.tap();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Back button ── */}
        <View style={styles.topBar}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* ── Intro line ── */}
        <Text style={styles.introText}>{t('intro')}</Text>

        {/* ── Big reference image (loading / found / fallback) ── */}
        <View style={[styles.imageArea, { backgroundColor: rarityTints[rarity] }]}>
          {loading ? (
            <View style={styles.imageLoading}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.imageLoadingText}>{t('lookingUp', { name })}</Text>
            </View>
          ) : lore?.imageUrl !== undefined ? (
            <Image
              source={{ uri: lore.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={t('referencePhotoA11y', { name })}
            />
          ) : (
            <Ionicons name={categoryIcon} size={64} color={rarityColor} />
          )}
        </View>

        {/* ── Identity + lore ── */}
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {scientificName !== undefined && (
            <Text style={styles.scientificName}>{scientificName}</Text>
          )}

          {/* Rarity + category */}
          <View style={styles.metaRow}>
            <RarityBadge rarity={rarity} />
            <View style={styles.categoryPill}>
              <Ionicons name={categoryIcon} size={14} color={colors.textSecondary} />
              <Text style={styles.categoryPillText}>{common.category(category)}</Text>
            </View>
          </View>

          {/* Lore — same branching + paragraph split as CardDetailScreen's About block */}
          <View style={styles.section}>
            {loading ? null : lore !== null ? (
              <>
                {lore.summary.split(/\n{2,}/).map((para, i) => (
                  <Text key={i} style={[styles.loreText, i > 0 && styles.loreParaSpacing]}>
                    {para.trim()}
                  </Text>
                ))}
                <View style={styles.loreFooter}>
                  <Text style={styles.loreSource}>
                    {lore.description !== undefined
                      ? `${lore.description} · ${t('viaWikipedia')}`
                      : t('viaWikipedia')}
                  </Text>
                  {lore.url !== undefined && (
                    <Pressable
                      onPress={() => {
                        void Linking.openURL(lore.url as string);
                      }}
                      hitSlop={8}
                      accessibilityRole="link"
                      accessibilityLabel={t('readMoreA11y')}
                    >
                      <Text style={styles.loreLink}>{t('readMore')}</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : (
              <Text style={styles.loreText}>{t('noLore')}</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const IMAGE_HEIGHT = 280;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },

  /* ── Top bar ── */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingTop: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    backgroundColor: colors.surfaceElevated,
  },

  introText: {
    ...typography.subheadline,
    color: colors.textTertiary,
    paddingHorizontal: gutter,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },

  /* ── Reference image ── */
  imageArea: {
    height: IMAGE_HEIGHT,
    marginHorizontal: gutter,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLoading: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  imageLoadingText: {
    ...typography.footnote,
    color: colors.textMuted,
  },

  /* ── Body ── */
  body: {
    paddingHorizontal: gutter,
    marginTop: spacing.lg,
  },
  name: {
    ...typography.largeTitle,
    color: colors.textPrimary,
  },
  scientificName: {
    ...typography.callout,
    fontStyle: 'italic',
    color: colors.textTertiary,
    marginTop: spacing.xxs,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  categoryPillText: {
    ...typography.label,
    color: colors.textSecondary,
  },

  /* ── Lore section ── */
  section: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  loreText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
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
});
