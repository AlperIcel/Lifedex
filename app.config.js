/**
 * Expo dynamic config — injects environment variables into `expo.extra` so they
 * reach the app at runtime via Constants.expoConfig.extra (read in src/config/env.ts).
 *
 * Expo loads .env files into process.env when resolving this config, so the
 * Supabase URL/key (and provider flags) flow from .env -> here -> extra -> env.ts.
 * Plain (non-EXPO_PUBLIC) vars are NOT auto-bundled, which is why we route them
 * through `extra` explicitly. The base app config still lives in app.json.
 */
const appJson = require('./app.json');

module.exports = () => ({
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    // Native Google Maps (react-native-maps) needs an API key on Android. It is
    // only used when MAPS_PROVIDER != mock (Phase 3). Kept out of app.json as a
    // secret and supplied via env for real builds — harmless/omitted when unset.
    ...(process.env.GOOGLE_MAPS_API_KEY !== undefined && process.env.GOOGLE_MAPS_API_KEY.length > 0
      ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } } }
      : {}),
  },
  extra: {
    ...appJson.expo.extra,
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
    AI_PROVIDER: process.env.AI_PROVIDER ?? appJson.expo.extra?.AI_PROVIDER ?? 'mock',
    MAPS_PROVIDER: process.env.MAPS_PROVIDER ?? appJson.expo.extra?.MAPS_PROVIDER ?? 'mock',
    GOOGLE_CLOUD_VISION_KEY: process.env.GOOGLE_CLOUD_VISION_KEY ?? '',
    VISION_PROXY_URL: process.env.VISION_PROXY_URL ?? '',
    // Species-accurate recognition (iNaturalist CV + PlantNet). Non-EXPO_PUBLIC
    // vars are not bundled into the app, so they must be routed through `extra`
    // to reach Constants.expoConfig.extra at runtime (read in src/config/env.ts).
    INATURALIST_API_TOKEN: process.env.INATURALIST_API_TOKEN ?? '',
    INAT_PROXY_URL: process.env.INAT_PROXY_URL ?? '',
    PLANTNET_API_KEY: process.env.PLANTNET_API_KEY ?? '',
    PLANTNET_PROXY_URL: process.env.PLANTNET_PROXY_URL ?? '',
  },
});
