/**
 * OnboardingScreen — "wonder first" first-run flow.
 *
 * Exactly 2 screens, no rule-reading gate before value is shown:
 *   1. Wonder — an actual example card (legendary) + the core promise line.
 *              This is the whole pitch, delivered before a single rule appears.
 *   2. Pledge — "discover, don't disturb" condensed into one promise paragraph
 *              + 3 compact points, instead of a 3-screen rulebook.
 *
 * Dark nature-game aesthetic, collectible-card feel. No API keys required —
 * fully functional in mock mode.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Animated,
  Dimensions,
  ViewToken,
  StatusBar,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import type { Category, Rarity } from '@/domain/types';
import { colors, rarityColors, spacing, radius, typography, motion } from '@/theme/theme';
import { setOnboarded } from '@/lib/onboarding';
import { Button, MockCardImage, RarityBadge } from '@/components';
import { useT } from '@/i18n';

// ─── types ───────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type IconName = keyof typeof Ionicons.glyphMap;

type SlideId = 'wonder' | 'pledge';

interface Slide {
  id: SlideId;
}

// ─── structural constants ───────────────────────────────────────────────────

const SLIDES: Slide[] = [{ id: 'wonder' }, { id: 'pledge' }];

/** Accent tint per slide — drives the active pager dot. */
const SLIDE_ACCENT: Record<SlideId, string> = {
  wonder: rarityColors.legendary,
  pledge: colors.moss,
};

/**
 * The demo card on the Wonder slide is always this exact rarity/category —
 * the most dazzling combination available, precisely because this card
 * doesn't need to be honest about a real find. It exists purely to sell the
 * promise in the first 5 seconds, before any rule is mentioned.
 */
const HERO_RARITY: Rarity = 'legendary';
const HERO_CATEGORY: Category = 'animal';

// ─── content ─────────────────────────────────────────────────────────────────

const C = {
  en: {
    skipA11y: 'Skip onboarding',
    skip: 'Skip',

    wonderEyebrow: 'YOUR FIELD GUIDE',
    wonderRibbon: 'NEW DISCOVERY',
    wonderCardName: 'Red Fox',
    wonderCardSci: 'Vulpes vulpes',
    wonderHeadline: 'Turn the real world into your collection.',
    wonderCaption:
      'Snap any plant or animal — LifeDex turns it into a one-of-a-kind card, rarity and all.',
    continueBtn: 'Continue',

    pledgeEyebrow: 'THE PROMISE',
    pledgeTitle: "Discover, don't disturb.",
    pledgeBody:
      'Get close with your camera, not your feet. LifeDex runs on one rule: observe gently, and let nature keep its secrets.',
    pledgePoint1: 'Keep your distance — never handle or bait wildlife',
    pledgePoint2: 'Stay on public trails; private land is off-limits',
    pledgePoint3: 'Rare & protected species keep their exact location hidden',
    getStartedBtn: 'Get Started',
    privacyFootnote: 'Your data stays on this device',

    progress: '{current} of {total}',
  },
  de: {
    skipA11y: 'Onboarding überspringen',
    skip: 'Überspringen',

    wonderEyebrow: 'DEIN FELDFÜHRER',
    wonderRibbon: 'NEUE ENTDECKUNG',
    wonderCardName: 'Rotfuchs',
    wonderCardSci: 'Vulpes vulpes',
    wonderHeadline: 'Verwandle die echte Natur in deine Sammlung.',
    wonderCaption:
      'Fotografiere Pflanze oder Tier — LifeDex macht daraus eine einzigartige Karte, inklusive Seltenheit.',
    continueBtn: 'Weiter',

    pledgeEyebrow: 'UNSER VERSPRECHEN',
    pledgeTitle: 'Entdecken, nicht stören.',
    pledgeBody:
      'Komm mit der Kamera näher, nicht mit den Füßen. LifeDex folgt einer Regel: sanft beobachten und der Natur ihre Geheimnisse lassen.',
    pledgePoint1: 'Abstand halten — Tiere nie berühren oder anlocken',
    pledgePoint2: 'Auf öffentlichen Wegen bleiben; Privatgrund ist tabu',
    pledgePoint3: 'Seltene & geschützte Arten behalten ihren genauen Standort für sich',
    getStartedBtn: "Los geht's",
    privacyFootnote: 'Deine Daten bleiben auf diesem Gerät',

    progress: '{current} von {total}',
  },
} as const;

const { width: SCREEN_W } = Dimensions.get('window');

// ─── sub-components ──────────────────────────────────────────────────────────

/** Icon + text row — used for the pledge's condensed key points. */
const PointRow = React.memo(({ icon, text }: { icon: IconName; text: string }) => (
  <View style={styles.pointRow}>
    <View style={styles.pointIconBox}>
      <Ionicons name={icon} size={18} color={colors.textPrimary} />
    </View>
    <Text style={styles.pointText}>{text}</Text>
  </View>
));

/**
 * Screen 1 — the "aha". An actual example card, front and center, before any
 * rule is mentioned. Pops in with a small bounce so the first frame already
 * feels alive rather than like a form to get through.
 */
const WonderSlide = React.memo(() => {
  const t = useT(C);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pop, {
      toValue: 1,
      duration: motion.duration.reveal,
      easing: motion.easing.overshoot,
      useNativeDriver: true,
    }).start();
  }, [pop]);

  const cardScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Text style={styles.wonderEyebrow}>{t('wonderEyebrow')}</Text>

      <Animated.View style={[styles.heroCard, { opacity: pop, transform: [{ scale: cardScale }] }]}>
        <View style={styles.heroAccentBar} />
        <View style={styles.heroImageArea}>
          <MockCardImage
            uri="mock-card://onboarding/hero"
            rarity={HERO_RARITY}
            category={HERO_CATEGORY}
            name={t('wonderCardName')}
          />
          <View style={styles.heroRibbon}>
            <Ionicons name="sparkles" size={11} color={colors.onAccent} />
            <Text style={styles.heroRibbonText}>{t('wonderRibbon')}</Text>
          </View>
        </View>
        <View style={styles.heroCardFooter}>
          <View style={styles.heroNameBlock}>
            <Text style={styles.heroCardName}>{t('wonderCardName')}</Text>
            <Text style={styles.heroCardSci}>{t('wonderCardSci')}</Text>
          </View>
          <RarityBadge rarity={HERO_RARITY} size="md" />
        </View>
      </Animated.View>

      <Text style={styles.wonderHeadline}>{t('wonderHeadline')}</Text>
      <Text style={styles.wonderCaption}>{t('wonderCaption')}</Text>
    </View>
  );
});

/**
 * Screen 2 — the ethics, condensed to one promise + 3 compact points instead
 * of a 3-screen rulebook. Still the brand's core ethos ("discover, don't
 * disturb"), just framed as what LifeDex does for the wild, not a checklist
 * standing between the user and the app.
 */
const PledgeSlide = React.memo(() => {
  const t = useT(C);

  const points: Array<{ icon: IconName; text: string }> = [
    { icon: 'paw-outline', text: t('pledgePoint1') },
    { icon: 'trail-sign-outline', text: t('pledgePoint2') },
    { icon: 'eye-off-outline', text: t('pledgePoint3') },
  ];

  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <View style={styles.pledgeCard}>
        <View style={styles.pledgeAccentBar} />
        <View style={styles.pledgeInner}>
          <View style={styles.pledgeIconCircle}>
            <Ionicons name="shield-checkmark-outline" size={26} color={colors.moss} />
          </View>
          <Text style={styles.pledgeEyebrow}>{t('pledgeEyebrow')}</Text>
          <Text style={styles.pledgeTitle}>{t('pledgeTitle')}</Text>
          <Text style={styles.pledgeBody}>{t('pledgeBody')}</Text>

          <View style={styles.pledgeDivider} />

          <View style={styles.pointsContainer}>
            {points.map((p) => (
              <PointRow key={p.text} icon={p.icon} text={p.text} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
});

const DOT_WIDTH_INACTIVE = 6;
const DOT_WIDTH_ACTIVE = 20;

const Dot = React.memo(({ active, color }: { active: boolean; color: string }) => {
  const width = useRef(new Animated.Value(active ? DOT_WIDTH_ACTIVE : DOT_WIDTH_INACTIVE)).current;
  const isMounted = useRef(false);

  React.useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    Animated.timing(width, {
      toValue: active ? DOT_WIDTH_ACTIVE : DOT_WIDTH_INACTIVE,
      duration: motion.duration.fast,
      easing: motion.easing.standard,
      // width cannot be animated on the native driver
      useNativeDriver: false,
    }).start();
  }, [active, width]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { width, backgroundColor: active ? color : colors.border },
      ]}
    />
  );
});

// ─── screen ──────────────────────────────────────────────────────────────────

export function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const t = useT(C);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList<Slide>>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        setActiveIndex(first.index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const finish = useCallback(() => {
    void setOnboarded();
    // First run: Onboarding is the initial route (no back stack) → enter the app.
    // Re-opened from Settings ("Review rules"): just pop back, don't push a second
    // Tabs instance onto the stack.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Tabs', { screen: 'Home' });
    }
  }, [navigation]);

  const handleNext = useCallback(() => {
    const next = activeIndex + 1;
    if (next < SLIDES.length) {
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      finish();
    }
  }, [activeIndex, finish]);

  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  const isLast = activeIndex === SLIDES.length - 1;
  const activeSlide = SLIDES[activeIndex] ?? SLIDES[0]!;
  // guaranteed non-null since activeIndex is bounded

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* top bar */}
      <View style={styles.topBar}>
        {/* wordmark */}
        <View style={styles.wordmark}>
          <Ionicons name="leaf-outline" size={18} color={colors.moss} />
          <Text style={styles.wordmarkText}>LifeDex</Text>
        </View>
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel={t('skipA11y')}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>{t('skip')}</Text>
        </Pressable>
      </View>

      {/* slides pager */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (item.id === 'wonder' ? <WonderSlide /> : <PledgeSlide />)}
        style={styles.pager}
      />

      {/* bottom controls */}
      <View style={styles.bottomBar}>
        {/* dots */}
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s.id} active={i === activeIndex} color={SLIDE_ACCENT[activeSlide.id]} />
          ))}
        </View>

        {/* CTA button */}
        <Button
          title={isLast ? t('getStartedBtn') : t('continueBtn')}
          onPress={handleNext}
          variant="primary"
          size="lg"
          fullWidth
        />

        {isLast ? (
          <View style={styles.privacyFootnote}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.privacyFootnoteText}>{t('privacyFootnote')}</Text>
          </View>
        ) : null}

        {/* progress caption */}
        <Text style={styles.progressCaption}>
          {t('progress', { current: activeIndex + 1, total: SLIDES.length })}
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.md : spacing.sm,
    paddingBottom: spacing.sm,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  wordmarkText: {
    ...typography.heading,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  skipBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  skipText: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },

  // pager
  pager: {
    flex: 1,
  },
  slide: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },

  // wonder slide — hero card
  wonderEyebrow: {
    ...typography.label,
    color: colors.moss,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  heroCard: {
    alignSelf: 'center',
    width: '86%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${rarityColors.legendary}55`,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  heroAccentBar: {
    height: 3,
    backgroundColor: rarityColors.legendary,
  },
  heroImageArea: {
    height: 190,
    backgroundColor: colors.surfaceElevated,
  },
  heroRibbon: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: rarityColors.legendary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heroRibbonText: {
    ...typography.label,
    color: colors.onAccent,
    letterSpacing: 0.8,
  },
  heroCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  heroNameBlock: {
    gap: 2,
  },
  heroCardName: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  heroCardSci: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  wonderHeadline: {
    ...typography.title1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  wonderCaption: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },

  // pledge slide
  pledgeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.moss}40`,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  pledgeAccentBar: {
    height: 3,
    backgroundColor: colors.moss,
  },
  pledgeInner: {
    padding: spacing.lg,
  },
  pledgeIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: `${colors.moss}18`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  pledgeEyebrow: {
    ...typography.label,
    color: colors.moss,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  pledgeTitle: {
    ...typography.title2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  pledgeBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  pledgeDivider: {
    height: 1,
    backgroundColor: `${colors.moss}30`,
    marginBottom: spacing.md,
  },
  pointsContainer: {
    gap: spacing.sm,
  },

  // point row (pledge key points)
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pointIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pointText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 22,
    paddingTop: spacing.xs,
  },

  // bottom bar
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'android' ? spacing.lg : spacing.md,
    paddingTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dot: {
    height: 6,
    borderRadius: radius.pill,
    // width animated per-dot (see Dot component)
  },
  privacyFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  privacyFootnoteText: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
  progressCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

export default OnboardingScreen;
