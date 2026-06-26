/**
 * Navigation param contracts. Shared by navigators and screens so route names
 * and params stay type-checked across the app.
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

/** Bottom tab bar. */
export type RootTabParamList = {
  Home: undefined;
  Map: undefined;
  Capture: undefined;
  Collection: undefined;
  Leaderboard: undefined;
};

/** Root stack: the tabs plus modal/detail screens pushed over them. */
export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<RootTabParamList>;
  CardDetail: { cardId: string };
  Result: { sightingId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
