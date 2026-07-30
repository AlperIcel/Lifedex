/**
 * RootNavigator — the complete navigation tree for LifeDex.
 *
 * Structure:
 *   RootStack (NativeStack)
 *   ├── Onboarding          (full-screen, no tabs)
 *   ├── Tabs (BottomTabs)
 *   │   ├── Home
 *   │   ├── Map
 *   │   ├── Capture         (centre FAB-style tab, no header)
 *   │   ├── Collection
 *   │   └── Stats           (local Stats & Achievements — v1 solo-cut;
 *   │                        replaces Leaderboard, see STATUS.md)
 *   ├── Result              (modal presentation over tabs)
 *   ├── CardDetail          (modal presentation over tabs)
 *   └── SpeciesOfDay        (modal presentation over tabs — info screen, not a capture flow)
 *
 * Aesthetic: dark nature-game, collectible-card feel.
 * Uses theme colors throughout — never hardcodes hex values inline.
 */

import React from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { haptics } from '@/utils/haptics';
import { useT } from '@/i18n';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { HomeScreen } from '@/screens/HomeScreen';
// MapScreen is a default export
import MapScreenDefault from '@/screens/MapScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { CollectionScreen } from '@/screens/CollectionScreen';
import { StatsScreen } from '@/screens/StatsScreen';
// CardDetailScreen is a named export
import { CardDetailScreen } from '@/screens/CardDetailScreen';
// SpeciesOfDayScreen is a named export
import { SpeciesOfDayScreen } from '@/screens/SpeciesOfDayScreen';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import { colors, elevation, radius, spacing, typography } from '@/theme/theme';

const MapScreen = MapScreenDefault;

/* ------------------------------------------------------------------
   Lazy imports for screens that use expo-camera / heavy deps — keeps
   the initial bundle lean on first-paint.
   CaptureScreen is a default export. ResultScreen is a default export.
   NOTE: LeaderboardScreen is intentionally NOT imported here anymore — the
   Leaderboard tab is replaced by StatsScreen for v1 (solo-cut, see
   STATUS.md "Release plan"). The screen file itself is kept, untouched,
   for v1.1's community re-enable.
------------------------------------------------------------------ */
const CaptureScreen = React.lazy(
  () => import('@/screens/CaptureScreen'),
);

const ResultScreen = React.lazy(
  () => import('@/screens/ResultScreen'),
);

/* ------------------------------------------------------------------ */
/* Icon sets — Ionicons (no emoji in chrome)                            */
/* ------------------------------------------------------------------ */

type TabIconName = 'Home' | 'Map' | 'Capture' | 'Collection' | 'Stats';
type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<TabIconName, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Map: { active: 'map', inactive: 'map-outline' },
  Capture: { active: 'camera', inactive: 'camera' },
  Collection: { active: 'albums', inactive: 'albums-outline' },
  Stats: { active: 'stats-chart', inactive: 'stats-chart-outline' },
};

/** Tab labels — English exact (kept for visual parity); German added
 * alongside. Looked up reactively via useT so the tab bar re-renders
 * instantly on a language switch. */
const TAB_LABELS = {
  en: {
    Home: 'Home',
    Map: 'Map',
    Capture: 'Capture',
    Collection: 'Collection',
    Stats: 'Stats',
  },
  de: {
    Home: 'Start',
    Map: 'Karte',
    Capture: 'Fangen',
    Collection: 'Sammlung',
    Stats: 'Statistiken',
  },
} as const;

/** Screen-reader labels for the tab bar buttons (same reactive pattern). */
const TAB_A11Y = {
  en: {
    home: 'Home feed',
    map: 'Sightings map',
    capture: 'Capture a species',
    collection: 'My collection',
    stats: 'Stats and achievements',
  },
  de: {
    home: 'Start-Feed',
    map: 'Sichtungskarte',
    capture: 'Art fangen',
    collection: 'Meine Sammlung',
    stats: 'Statistiken und Erfolge',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Custom tab bar                                                       */
/* ------------------------------------------------------------------ */

interface TabBarIconProps {
  name: TabIconName;
  focused: boolean;
  isCenterCapture?: boolean;
}

function TabBarIcon({ name, focused, isCenterCapture = false }: TabBarIconProps) {
  const t = useT(TAB_LABELS);
  const icon = focused ? TAB_ICONS[name].active : TAB_ICONS[name].inactive;
  const label = t(name);

  // Fade the label in only when focused (Apple-restrained tab bar).
  const labelOpacity = React.useRef(new Animated.Value(focused ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(labelOpacity, {
      toValue: focused ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [focused, labelOpacity]);

  if (isCenterCapture) {
    return (
      <View style={styles.captureTabOuter}>
        <View style={styles.captureTabInner}>
          <Ionicons name="camera" size={26} color={colors.onAccent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabIconWrap}>
      <Ionicons
        name={icon}
        size={24}
        color={focused ? colors.accent : colors.textTertiary}
      />
      <Animated.Text
        style={[styles.tabLabel, { opacity: labelOpacity }]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Navigators                                                           */
/* ------------------------------------------------------------------ */

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

/** Bottom-tab navigator housing the five main screens. */
function TabNavigator() {
  const ta11y = useT(TAB_A11Y);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        // Transparent background — custom bar style handles theming
        tabBarBackground: () => <View style={styles.tabBarBackground} />,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Home" focused={focused} />
          ),
          tabBarAccessibilityLabel: ta11y('home'),
        }}
      />

      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Map" focused={focused} />
          ),
          tabBarAccessibilityLabel: ta11y('map'),
        }}
      />

      {/* Centre capture tab — elevated FAB feel */}
      <Tab.Screen
        name="Capture"
        options={{
          // Full-screen camera: hide the bottom tab bar while capturing so the
          // shutter no longer overlaps it (WhatsApp-style). A close button inside
          // the screen returns to Home.
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Capture" focused={focused} isCenterCapture />
          ),
          tabBarAccessibilityLabel: ta11y('capture'),
          // Slightly wider hit target for the FAB
          tabBarButton: (props) => (
            <Pressable
              {...props}
              onPress={(e) => {
                haptics.press();
                props.onPress?.(e);
              }}
              style={[props.style, styles.captureTabButton]}
              android_ripple={{ color: colors.accent + '33', radius: 36 }}
            />
          ),
        }}
      >
        {(props) => (
          <React.Suspense fallback={<LoadingScreen />}>
            <CaptureScreen {...(props as Parameters<typeof CaptureScreen>[0])} />
          </React.Suspense>
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Collection"
        component={CollectionScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Collection" focused={focused} />
          ),
          tabBarAccessibilityLabel: ta11y('collection'),
        }}
      />

      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Stats" focused={focused} />
          ),
          tabBarAccessibilityLabel: ta11y('stats'),
        }}
      />
    </Tab.Navigator>
  );
}

/** Root stack — wraps tabs with full-screen modal routes. */
export function RootNavigator({
  initialRouteName = 'Onboarding',
}: {
  initialRouteName?: keyof RootStackParamList;
} = {}) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
      }}
    >
      {/* Full-screen onboarding (no tab bar) */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ gestureEnabled: false }}
      />

      {/* Main tab navigator */}
      <Stack.Screen name="Tabs" component={TabNavigator} />

      {/* Modal screens presented over the tab bar */}
      <Stack.Screen
        name="Result"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      >
        {(props) => (
          <React.Suspense fallback={<LoadingScreen />}>
            <ResultScreen {...(props as Parameters<typeof ResultScreen>[0])} />
          </React.Suspense>
        )}
      </Stack.Screen>

      <Stack.Screen
        name="CardDetail"
        component={CardDetailScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />

      <Stack.Screen
        name="SpeciesOfDay"
        component={SpeciesOfDayScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />

      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
    </Stack.Navigator>
  );
}

/* ------------------------------------------------------------------ */
/* Loading fallback                                                     */
/* ------------------------------------------------------------------ */

function LoadingScreen() {
  return (
    <View style={styles.loadingRoot}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const TAB_BAR_HEIGHT = 64;
const CAPTURE_SIZE = 58;
const CAPTURE_RISE = 14; // px the capture button rises above the bar

const styles = StyleSheet.create({
  /* Tab bar container */
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: TAB_BAR_HEIGHT + (Platform.OS === 'ios' ? 20 : 0), // add iOS safe-area buffer
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarBackground: {
    flex: 1,
    backgroundColor: colors.surface,
    opacity: 0.98,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },

  /* Regular tab item */
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: spacing.xs,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.45,
  },
  tabIconFocused: {
    opacity: 1,
  },
  tabLabel: {
    ...typography.caption,
    color: colors.accent,
    fontSize: 10,
  },
  tabActiveBar: {
    position: 'absolute',
    bottom: -6,
    width: 16,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
  },

  /* Capture FAB-style centre button */
  captureTabButton: {
    flex: 1,
    // Extra hit area for the raised button
    paddingBottom: CAPTURE_RISE,
  },
  captureTabOuter: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: TAB_BAR_HEIGHT,
    // Raise the button above the bar
    marginBottom: CAPTURE_RISE,
  },
  captureTabInner: {
    width: CAPTURE_SIZE,
    height: CAPTURE_SIZE,
    borderRadius: CAPTURE_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.level2,
  },

  /* Loading fallback */
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingIcon: {
    fontSize: 40,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
