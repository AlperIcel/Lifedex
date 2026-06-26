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
  extra: {
    ...appJson.expo.extra,
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
    AI_PROVIDER: process.env.AI_PROVIDER ?? appJson.expo.extra?.AI_PROVIDER ?? 'mock',
    MAPS_PROVIDER: process.env.MAPS_PROVIDER ?? appJson.expo.extra?.MAPS_PROVIDER ?? 'mock',
  },
});
