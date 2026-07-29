/**
 * Expo dynamic config — the SINGLE source of app configuration (there is no
 * app.json; keeping both made expo-doctor flag a config-source ambiguity).
 *
 * Static config lives here directly. Environment variables are injected into
 * `extra` so they reach the app at runtime via Constants.expoConfig.extra
 * (read in src/config/env.ts): Expo loads .env into process.env when resolving
 * this file, and plain (non-EXPO_PUBLIC) vars are NOT auto-bundled, so they must
 * be routed through `extra` explicitly.
 */
module.exports = () => ({
  name: 'LifeDex',
  slug: 'lifedex',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'lifedex',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0F0E',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.lifedex.app',
    infoPlist: {
      NSCameraUsageDescription:
        'LifeDex uses the camera to photograph real living things you discover.',
      NSLocationWhenInUseUsageDescription:
        'LifeDex records a fuzzed location for your sightings. Exact GPS is never shared publicly.',
    },
  },
  android: {
    package: 'com.lifedex.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B0F0E',
    },
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    // Native Google Maps (react-native-maps) needs an API key on Android — only
    // used when MAPS_PROVIDER != mock. Kept out of source as a secret, supplied
    // via env for real builds; harmless/omitted when unset.
    ...(process.env.GOOGLE_MAPS_API_KEY !== undefined && process.env.GOOGLE_MAPS_API_KEY.length > 0
      ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } } }
      : {}),
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-camera', 'expo-location'],
  extra: {
    eas: { projectId: '5c92112f-1208-4dcb-b5f1-2cfc8f73b9dc' },
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
    AI_PROVIDER: process.env.AI_PROVIDER ?? 'mock',
    MAPS_PROVIDER: process.env.MAPS_PROVIDER ?? 'mock',
    GOOGLE_CLOUD_VISION_KEY: process.env.GOOGLE_CLOUD_VISION_KEY ?? '',
    VISION_PROXY_URL: process.env.VISION_PROXY_URL ?? '',
    // Species-accurate recognition (iNaturalist CV + PlantNet). Non-EXPO_PUBLIC
    // vars aren't bundled, so they reach the app only via extra (see env.ts).
    INATURALIST_API_TOKEN: process.env.INATURALIST_API_TOKEN ?? '',
    INAT_PROXY_URL: process.env.INAT_PROXY_URL ?? '',
    PLANTNET_API_KEY: process.env.PLANTNET_API_KEY ?? '',
    PLANTNET_PROXY_URL: process.env.PLANTNET_PROXY_URL ?? '',
  },
});
