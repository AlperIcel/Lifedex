/**
 * App.tsx — LifeDex root component.
 *
 * Wraps the entire app in:
 *   - SafeAreaProvider (react-native-safe-area-context) — must be the outermost
 *     provider so useSafeAreaInsets() works anywhere in the tree.
 *   - NavigationContainer (React Navigation) — provides the navigation context
 *     used by every navigator and useNavigation() hook.
 *   - RootNavigator — the full navigation tree (onboarding → tabs → modals).
 *
 * Status bar is set to light-content globally to match the dark theme.
 * No API keys or network access required in mock mode (the default).
 */

import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { colors } from './src/theme/theme';
import { RootNavigator } from './src/navigation/RootNavigator';
import { lifeDexStore } from './src/store/useLifeDexStore';
import { ensureAnonSession } from './src/lib/community';

/**
 * Navigation theme that matches the LifeDex dark-nature palette.
 * Setting these prevents the brief white-background flash on screen transitions.
 */
const NAV_THEME: Theme = {
  dark: true,
  colors: {
    primary: colors.teal,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.teal,
  },
};

export default function App(): React.JSX.Element {
  // Restore persisted captures on startup (seed shows immediately, then merges).
  useEffect(() => {
    void lifeDexStore.hydrate();
    // Best-effort anonymous sign-in for the community layer (no-op if disabled).
    void ensureAnonSession();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <NavigationContainer theme={NAV_THEME}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
