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
 *   │   └── Leaderboard
 *   ├── Result              (modal presentation over tabs)
 *   └── CardDetail          (modal presentation over tabs)
 *
 * Aesthetic: dark nature-game, collectible-card feel.
 * Uses theme colors throughout — never hardcodes hex values inline.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeScreen } from '@/screens/HomeScreen';
// MapScreen is a default export
import MapScreenDefault from '@/screens/MapScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { CollectionScreen } from '@/screens/CollectionScreen';
// CardDetailScreen is a named export
import { CardDetailScreen } from '@/screens/CardDetailScreen';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import { colors, radius, spacing, typography } from '@/theme/theme';

const MapScreen = MapScreenDefault;

/* ------------------------------------------------------------------
   Lazy imports for screens that use expo-camera / heavy deps — keeps
   the initial bundle lean on first-paint.
   CaptureScreen and LeaderboardScreen are default exports.
   ResultScreen is a default export.
------------------------------------------------------------------ */
const CaptureScreen = React.lazy(
  () => import('@/screens/CaptureScreen'),
);

const LeaderboardScreen = React.lazy(
  () => import('@/screens/LeaderboardScreen'),
);

const ResultScreen = React.lazy(
  () => import('@/screens/ResultScreen'),
);

/* ------------------------------------------------------------------ */
/* Icon sets — text emoji, no image assets required                    */
/* ------------------------------------------------------------------ */

type TabIconName = 'Home' | 'Map' | 'Capture' | 'Collection' | 'Leaderboard';

const TAB_ICONS: Record<TabIconName, { active: string; inactive: string }> = {
  Home: { active: '🏠', inactive: '🏠' },
  Map: { active: '🗺', inactive: '🗺' },
  Capture: { active: '📷', inactive: '📷' },
  Collection: { active: '📚', inactive: '📚' },
  Leaderboard: { active: '🏆', inactive: '🏆' },
};

const TAB_LABELS: Record<TabIconName, string> = {
  Home: 'Home',
  Map: 'Map',
  Capture: 'Capture',
  Collection: 'Collection',
  Leaderboard: 'Ranks',
};

/* ------------------------------------------------------------------ */
/* Custom tab bar                                                       */
/* ------------------------------------------------------------------ */

interface TabBarIconProps {
  name: TabIconName;
  focused: boolean;
  isCenterCapture?: boolean;
}

function TabBarIcon({ name, focused, isCenterCapture = false }: TabBarIconProps) {
  const { active, inactive } = TAB_ICONS[name];
  const icon = focused ? active : inactive;
  const label = TAB_LABELS[name];

  if (isCenterCapture) {
    return (
      <View style={styles.captureTabOuter}>
        <View
          style={[
            styles.captureTabInner,
            focused && styles.captureTabInnerFocused,
          ]}
        >
          <Text style={styles.captureTabIcon}>{icon}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabIconWrap}>
      <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{icon}</Text>
      <Text
        style={[styles.tabLabel, focused && styles.tabLabelFocused]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {focused && <View style={styles.tabActiveBar} />}
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
          tabBarAccessibilityLabel: 'Home feed',
        }}
      />

      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Map" focused={focused} />
          ),
          tabBarAccessibilityLabel: 'Sightings map',
        }}
      />

      {/* Centre capture tab — elevated FAB feel */}
      <Tab.Screen
        name="Capture"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Capture" focused={focused} isCenterCapture />
          ),
          tabBarAccessibilityLabel: 'Capture a species',
          // Slightly wider hit target for the FAB
          tabBarButton: (props) => (
            <Pressable
              {...props}
              style={[props.style, styles.captureTabButton]}
              android_ripple={{ color: colors.teal + '33', radius: 36 }}
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
          tabBarAccessibilityLabel: 'My collection',
        }}
      />

      <Tab.Screen
        name="Leaderboard"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Leaderboard" focused={focused} />
          ),
          tabBarAccessibilityLabel: 'Leaderboard',
        }}
      >
        {(props) => (
          <React.Suspense fallback={<LoadingScreen />}>
            <LeaderboardScreen {...(props as Parameters<typeof LeaderboardScreen>[0])} />
          </React.Suspense>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

/** Root stack — wraps tabs with full-screen modal routes. */
export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Onboarding"
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
    </Stack.Navigator>
  );
}

/* ------------------------------------------------------------------ */
/* Loading fallback                                                     */
/* ------------------------------------------------------------------ */

function LoadingScreen() {
  return (
    <View style={styles.loadingRoot}>
      <Text style={styles.loadingIcon}>🌿</Text>
      <Text style={styles.loadingText}>Loading…</Text>
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },
  tabLabelFocused: {
    color: colors.teal,
    fontWeight: '700',
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
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  captureTabInnerFocused: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  captureTabIcon: {
    fontSize: 26,
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
