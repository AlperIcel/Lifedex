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
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewToken,
  StatusBar,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { colors, spacing, radius, typography, motion } from '@/theme/theme';
import { setOnboarded } from '@/lib/onboarding';
import { Button } from '@/components';

// ─── types ───────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type IconName = keyof typeof Ionicons.glyphMap;

interface Step {
  id: string;
  icon: IconName;
  accentColor: string;
  badge: string;
  title: string;
  subtitle: string;
  rules: Array<{ icon: IconName; text: string }>;
}

// ─── content ─────────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: 'respect',
    icon: 'paw-outline',
    accentColor: colors.success,      // moss green
    badge: 'RULE 01',
    title: 'Respect the Wild',
    subtitle: 'Every creature deserves space.',
    rules: [
      { icon: 'egg-outline', text: 'Never disturb nests, dens, or young animals.' },
      { icon: 'volume-mute-outline', text: 'Observe silently — no sudden moves or noise.' },
      { icon: 'camera-outline', text: 'Photograph from a safe distance. Zoom in, stay back.' },
    ],
  },
  {
    id: 'boundaries',
    icon: 'trail-sign-outline',
    accentColor: colors.teal,
    badge: 'RULE 02',
    title: 'Honor Boundaries',
    subtitle: 'Discovery never justifies trespass.',
    rules: [
      { icon: 'walk-outline', text: 'Stay on public land and marked trails.' },
      { icon: 'home-outline', text: 'Private property = off-limits, always.' },
      { icon: 'leaf-outline', text: 'Do not collect, uproot, or damage plants.' },
    ],
  },
  {
    id: 'protect',
    icon: 'shield-half-outline',
    accentColor: colors.amber,
    badge: 'RULE 03',
    title: 'Protect the Rare',
    subtitle: 'Some locations must stay secret.',
    rules: [
      { icon: 'location-outline', text: 'Exact GPS of protected species is never shared publicly.' },
      { icon: 'eye-off-outline', text: 'Rare & endangered sightings get extra location fuzz.' },
      { icon: 'lock-closed-outline', text: 'Your original photo stays private — only AI cards go public.' },
    ],
  },
];

const { width: SCREEN_W } = Dimensions.get('window');

// ─── sub-components ──────────────────────────────────────────────────────────

const RuleRow = React.memo(({ icon, text }: { icon: IconName; text: string }) => (
  <View style={styles.ruleRow}>
    <View style={styles.ruleIconBox}>
      <Ionicons name={icon} size={18} color={colors.textPrimary} />
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
          <Ionicons name={step.icon} size={26} color={step.accentColor} />
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

  const finish = useCallback(() => {
    void setOnboarded();
    navigation.replace('Tabs', { screen: 'Home' });
  }, [navigation]);

  const handleNext = useCallback(() => {
    const next = activeIndex + 1;
    if (next < STEPS.length) {
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      finish();
    }
  }, [activeIndex, finish]);

  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

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
          <Ionicons name="leaf-outline" size={18} color={colors.moss} />
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
        <Button
          title={isLast ? 'Start exploring' : 'Continue'}
          onPress={handleNext}
          variant="primary"
          size="lg"
          fullWidth
        />

        {isLast ? (
          <View style={styles.privacyFootnote}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.privacyFootnoteText}>Your data stays on this device</Text>
          </View>
        ) : null}

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
    ...typography.title1,
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
  cardTitle: {
    ...typography.title2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.callout,
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
