/**
 * Supabase client (guarded).
 *
 * `supabase` is null when no Supabase URL/key is configured (the default local
 * mock setup), so every caller must null-check it. The auth session is persisted
 * in AsyncStorage so an anonymous session survives app restarts.
 *
 * Only the publishable/anon key is used here — safe for the client because Row
 * Level Security governs every table. The secret key never touches the app.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/config/env';

export const isSupabaseEnabled = env.useSupabase;

export const supabase: SupabaseClient | null =
  isSupabaseEnabled && env.supabaseUrl !== undefined && env.supabaseAnonKey !== undefined
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
