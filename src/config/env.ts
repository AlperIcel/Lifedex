/**
 * Zod-validated environment loader.
 *
 * In mock mode (AI_PROVIDER=mock / MAPS_PROVIDER=mock, the defaults) every key is
 * optional and the app runs with NO secrets. Supabase keys are only required if
 * you switch a provider away from "mock". Reads from Expo config `extra` and from
 * process.env so it works in app, web, and test contexts. No secrets hardcoded.
 */
import Constants from 'expo-constants';
import { z } from 'zod';

const ProviderSchema = z.enum(['mock']).or(z.string().min(1));

const RawEnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_ANON_KEY: z.string().optional().or(z.literal('')),
  AI_PROVIDER: ProviderSchema.default('mock'),
  MAPS_PROVIDER: ProviderSchema.default('mock'),
});

type RawEnv = z.infer<typeof RawEnvSchema>;

function readRaw(): Record<string, string | undefined> {
  const extra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ?? {};
  const pick = (key: string): string | undefined => {
    const fromProcess = process.env[key];
    if (typeof fromProcess === 'string' && fromProcess.length > 0) {
      return fromProcess;
    }
    const fromExtra = extra[key];
    return typeof fromExtra === 'string' ? fromExtra : undefined;
  };
  return {
    SUPABASE_URL: pick('SUPABASE_URL'),
    SUPABASE_ANON_KEY: pick('SUPABASE_ANON_KEY'),
    AI_PROVIDER: pick('AI_PROVIDER'),
    MAPS_PROVIDER: pick('MAPS_PROVIDER'),
  };
}

const parsed: RawEnv = RawEnvSchema.parse(readRaw());

const isMockAi = parsed.AI_PROVIDER === 'mock';
const isMockMaps = parsed.MAPS_PROVIDER === 'mock';

/**
 * Typed, validated environment. `mockMode` is true when both AI and maps run on
 * the mock providers — the no-keys local default.
 */
export const env = {
  supabaseUrl: parsed.SUPABASE_URL && parsed.SUPABASE_URL.length > 0
    ? parsed.SUPABASE_URL
    : undefined,
  supabaseAnonKey:
    parsed.SUPABASE_ANON_KEY && parsed.SUPABASE_ANON_KEY.length > 0
      ? parsed.SUPABASE_ANON_KEY
      : undefined,
  aiProvider: parsed.AI_PROVIDER,
  mapsProvider: parsed.MAPS_PROVIDER,
  isMockAi,
  isMockMaps,
  mockMode: isMockAi && isMockMaps,
} as const;

export type Env = typeof env;
