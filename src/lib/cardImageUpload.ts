/**
 * Upload a local card image (the on-device crop) to the public `card-images`
 * Supabase Storage bucket and return its public URL.
 *
 * Best-effort + guarded: returns null when Supabase is off, the bucket/policies
 * aren't set up yet, or the upload fails. The community layer falls back to a
 * placeholder in that case — never publishing a local `file://` path.
 *
 * Only the processed card (AI recreation / subject crop) is uploaded — never the
 * original photo. Path is user-scoped: {userId}/{sightingId}.jpg.
 */
import { supabase } from './supabase';

const BUCKET = 'card-images';

export async function uploadCardImage(
  userId: string,
  sightingId: string,
  localUri: string,
): Promise<string | null> {
  if (supabase === null) return null;
  try {
    const path = `${userId}/${sightingId}.jpg`;
    // RN/Expo: fetch the local file into a Blob for upload.
    const resp = await fetch(localUri);
    const blob = await resp.blob();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error !== null) {
      console.warn('[LifeDex] card image upload failed:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn('[LifeDex] card image upload error', e);
    return null;
  }
}
