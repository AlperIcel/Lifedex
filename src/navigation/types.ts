/**
 * Navigation param contracts. Shared by navigators and screens so route names
 * and params stay type-checked across the app.
 */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Category, Rarity } from '@/domain/types';

/** Bottom tab bar. */
export type RootTabParamList = {
  Home: undefined;
  Map: undefined;
  Capture: undefined;
  Collection: undefined;
  /** Local Stats & Achievements — replaces the Leaderboard tab in v1 (solo-cut). */
  Stats: undefined;
  /** Kept for v1.1 (community re-enable); no longer wired into a tab. */
  Leaderboard: undefined;
};

/** Root stack: the tabs plus modal/detail screens pushed over them. */
export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<RootTabParamList>;
  CardDetail: { cardId: string };
  /** Informational Species-of-the-Day screen (picture + lore + rarity/category) — NOT a capture flow. */
  SpeciesOfDay: { name: string; scientificName?: string; rarity: Rarity; category: Category };
  Result: { sightingId: string };
  Settings: undefined;
  /** Solo Lab — the player's field bench for uncatalogued "bonus find" samples. */
  Lab: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
