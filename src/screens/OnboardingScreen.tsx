/**
 * OnboardingScreen — 3-step ethical discovery rules.
 * Dark nature-game aesthetic, collectible-card feel.
 * No API keys required — fully functional in mock mode.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewToken,
  StatusBar,
  Platform,
  SafeAreaView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { colors, spacing, radius, typography } from '@/theme/theme';

// ─── types ───────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

interface Step {
  id: string;
  icon: string;
  accentColor: string;
  badge: string;
  title: string;
  subtitle: string;
  rules: Array<{ icon: string; text: string }>;
}

// ─── content ─────────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: 'respect',
    icon: '🐾',
    accentColor: colors.success,      // moss green
    badge: 'RULE 01',
    title: 'Respect the Wild',
    subtitle: 'Every creature deserves space.',
    rules: [
      { icon: '🐣', text: 'Never disturb nests, dens, or young animals.' },
      { icon: '🔇', text: 'Observe silently — no sudden moves or noise.' },
      { icon: '📸', text: 'Photograph from a safe distance. Zoom in, stay back.' },
    ],
  },
  {
    id: 'boundaries',
    icon: '🌿',
    accentColor: colors.teal,
    badge: 'RULE 02',
    title: 'Honor Boundaries',
    subtitle: 'Discovery never justifies trespass.',
    rules: [
      { icon: '🚧', text: 'Stay on public land and marked trails.' },
      { icon: '🏡', text: 'Private property = off-limits, always.' },
      { icon: '🌸', text: 'Do not collect, uproot, or damage plants.' },
    ],
  },
  {
    id: 'protect',
    icon: '🛡️',
    accentColor: colors.amber,
    badge: 'RULE 03',
    title: 'Protect the Rare',
    subtitle: 'Some locations must stay secret.',
    rules: [
      { icon: '📍', text: 'Exact GPS of protected species is never shared publicly.' },
      { icon: '🦅', text: 'Rare & endangered sightings get extra location fuzz.' },
      { icon: '🔒', text: 'Your original photo stays private — only AI cards go public.' },
    ],
  },
];

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - spacing.lg * 2;

// ─── sub-components ──────────────────────────────────────────────────────────

const RuleRow = React.memo(({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.ruleRow}>
    <View style={styles.ruleIconBox}>
      <Text style={styles.ruleIcon}>{icon}</Text>
    </View>
    <Text style={styles.ruleText}>{text}</Text>
  </View>
));

const StepCard = React.memo(({ step, index }: { step: Step; index: number }) => (
  <View style={[styles.cardSlide, { width: SCREEN_W }]}>
    <View style={[styles.card, { borderColor: step.accentColor + '40' }]}>
      {/* top accent bar */}
      <View style={[styles.accentBar, { backgroundColor: step.accentColor }]} />

      {/* badge + icon */}
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { borderColor: step.accentColor + '80' }]}>
          <Text style={[styles.badgeText, { color: step.accentColor }]}>{step.badge}</Text>
        </View>
        <View style={[styles.iconCircle, { backgroundColor: step.accentColor + '18' }]}>
          <Text style={styles.stepIcon}>{step.icon}</Text>
        </View>
      </View>

      {/* title */}
      <Text style={styles.cardTitle}>{step.title}</Text>
      <Text style={styles.cardSubtitle}>{step.subtitle}</Text>

      {/* divider */}
      <View style={[styles.divider, { backgroundColor: step.accentColor + '30' }]} />

      {/* rules */}
      <View style={styles.rulesContainer}>
        {step.rules.map((rule) => (
          <RuleRow key={rule.text} icon={rule.icon} text={rule.text} />
        ))}
      </View>

      {/* step number watermark */}
      <Text style={[styles.stepWatermark, { color: step.accentColor + '12' }]}>
        0{index + 1}
      </Text>
    </View>
  </View>
));

const Dot = React.memo(
  ({ active, color }: { active: boolean; color: string }) => (
    <View
      style={[
        styles.dot,
        active
          ? { width: 22, backgroundColor: color }
          : { width: 8, backgroundColor: colors.border },
      ]}
    />
  ),
);

// ─── screen ──────────────────────────────────────────────────────────────────

export function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList<Step>>(null);

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

  const handleNext = useCallback(() => {
    const next = activeIndex + 1;
    if (next < STEPS.length) {
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      navigation.replace('Tabs', { screen: 'Home' });
    }
  }, [activeIndex, navigation]);

  const handleSkip = useCallback(() => {
    navigation.replace('Tabs', { screen: 'Home' });
  }, [navigation]);

  const isLast = activeIndex === STEPS.length - 1;
  const activeStep = STEPS[activeIndex] ?? STEPS[0]!;
  // guaranteed non-null since activeIndex is bounded

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* top bar */}
      <View style={styles.topBar}>
        {/* wordmark */}
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkIcon}>🌿</Text>
          <Text style={styles.wordmarkText}>LifeDex</Text>
        </View>
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Skip onboarding"
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* hero headline */}
      <View style={styles.heroSection}>
        <Text style={styles.heroLabel}>FIELD GUIDE</Text>
        <Text style={styles.heroTitle}>Discover. Collect.{'\n'}Protect.</Text>
        <Text style={styles.heroCaption}>
          A few rules before you head into the wild.
        </Text>
      </View>

      {/* cards pager */}
      <FlatList
        ref={flatRef}
        data={STEPS}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <StepCard step={item} index={index} />
        )}
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
      />

      {/* bottom controls */}
      <View style={styles.bottomBar}>
        {/* dots */}
        <View style={styles.dots}>
          {STEPS.map((s, i) => (
            <Dot
              key={s.id}
              active={i === activeIndex}
              color={activeStep.accentColor}
            />
          ))}
        </View>

        {/* CTA button */}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: activeStep.accentColor },
            pressed && styles.ctaPressed,
          ]}
          accessibilityLabel={isLast ? 'Got it — enter LifeDex' : 'Next rule'}
          accessibilityRole="button"
        >
          <Text style={styles.ctaBtnText}>
            {isLast ? '✓  Got it' : 'Next  →'}
          </Text>
        </Pressable>

        {/* progress caption */}
        <Text style={styles.progressCaption}>
          {activeIndex + 1} of {STEPS.length}
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
  wordmarkIcon: {
    fontSize: 18,
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

  // hero section
  heroSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  heroLabel: {
    ...typography.label,
    color: colors.moss,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  heroCaption: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // pager
  pager: {
    flex: 1,
  },
  pagerContent: {
    // paging handles width
  },
  cardSlide: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },

  // card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.lg,
    // subtle shadow
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
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    ...typography.label,
    letterSpacing: 1.5,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIcon: {
    fontSize: 26,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    marginBottom: spacing.md,
  },
  rulesContainer: {
    gap: spacing.sm,
  },
  stepWatermark: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    fontSize: 80,
    fontWeight: '900',
    lineHeight: 80,
    letterSpacing: -4,
  },

  // rule row
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  ruleIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ruleIcon: {
    fontSize: 18,
  },
  ruleText: {
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
    height: 8,
    borderRadius: radius.pill,
    // width set per-dot inline
  },
  ctaBtn: {
    width: CARD_W,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  ctaBtnText: {
    ...typography.heading,
    color: '#fff',
    letterSpacing: 0.5,
  },
  progressCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

export default OnboardingScreen;
