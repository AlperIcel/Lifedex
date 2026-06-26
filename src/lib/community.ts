/**
 * Community layer — shared, public sightings via Supabase.
 *
 * Everything here is best-effort and guarded: when Supabase is not configured
 * (`supabase === null`) every function is a safe no-op so the app keeps running
 * fully local. Network/auth failures are caught and logged, never thrown — a
 * backend hiccup must not break capture or the map.
 *
 * Auth: anonymous sign-in gives each device a stable user_id so RLS works and
 * users can insert their own rows, with no login screen yet.
 */
import type { Sighting } from '@/domain/types';
import { supabase } from './supabase';
import {
  rowToCommunitySighting,
  sightingToRow,
  type CommunityRow,
} from './communityMappers';

const TABLE = 'community_sightings';

/**
 * Ensure an anonymous auth session exists; returns the user id (or null when
 * Supabase is disabled or anonymous sign-in is not enabled on the project).
 */
export async function ensureAnonSession(): Promise<string | null> {
  if (supabase === null) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session !== null) return data.session.user.id;

    const { data: signIn, error } = await supabase.auth.signInAnonymously();
    if (error !== null) {
      // Most common cause: "Anonymous sign-ins" not enabled in the project.
      console.warn('[LifeDex] anonymous sign-in failed:', error.message);
      return null;
    }
    return signIn.user?.id ?? null;
  } catch (e) {
    console.warn('[LifeDex] ensureAnonSession error', e);
    return null;
  }
}

/** Push one capture's PUBLIC-safe data to the community feed (best-effort). */
export async function pushSighting(sighting: Sighting): Promise<void> {
  if (supabase === null) return;
  try {
    const userId = await ensureAnonSession();
    if (userId === null) return;
    const { error } = await supabase.from(TABLE).insert(sightingToRow(sighting, userId));
    if (error !== null) console.warn('[LifeDex] pushSighting failed:', error.message);
  } catch (e) {
    console.warn('[LifeDex] pushSighting error', e);
  }
}

/** Fetch recent community sightings (newest first). Returns [] when disabled/error. */
export async function fetchCommunitySightings(limit = 200): Promise<Sighting[]> {
  if (supabase === null) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error !== null || data === null) return [];
    return (data as CommunityRow[]).map(rowToCommunitySighting);
  } catch (e) {
    console.warn('[LifeDex] fetchCommunitySightings error', e);
    return [];
  }
}
