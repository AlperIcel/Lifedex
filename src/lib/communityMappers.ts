/**
 * Pure mappers between the app's Sighting and the Supabase `community_sightings`
 * row. Kept dependency-free (no supabase client import) so they are trivially
 * unit-testable and never pull native modules into tests.
 *
 * PRIVACY: only public-safe fields cross to the server. privatePhotoUri and the
 * exact GPS point are NEVER mapped — they stay on the device.
 */
import type {
  CaptiveStatus,
  CardMetadata,
  Category,
  Rarity,
  SensitivityLevel,
  Sighting,
} from '@/domain/types';

/** Row shape for INSERT (id + created_at are server-generated). */
export interface CommunityInsert {
  user_id: string;
  category: string;
  common_name: string;
  scientific_name: string | null;
  rarity: string;
  xp: number;
  captive_status: string;
  sensitivity: string;
  public_image_uri: string;
  public_lat: number | null;
  public_lng: number | null;
  public_precision_m: number;
  location_hidden: boolean;
  card: CardMetadata;
}

/** Row shape as returned by SELECT. */
export interface CommunityRow extends CommunityInsert {
  id: string;
  created_at: string;
}

/** Map an app Sighting to a public, shareable insert row. */
export function sightingToRow(s: Sighting, userId: string): CommunityInsert {
  return {
    user_id: userId,
    category: s.category,
    common_name: s.commonName,
    scientific_name: s.scientificName ?? null,
    rarity: s.rarity,
    xp: s.xp,
    captive_status: s.captiveStatus,
    sensitivity: s.sensitivity,
    public_image_uri: s.publicImageUri,
    public_lat: s.publicLocation.lat,
    public_lng: s.publicLocation.lng,
    public_precision_m: s.publicLocation.precisionMeters,
    location_hidden: s.publicLocation.hidden,
    card: s.card,
  };
}

/**
 * Map a server row back to a Sighting for display on the community map.
 * privatePhotoUri is empty (we never had it) and confidence defaults to 1 — these
 * fields are not shown for community pins.
 */
export function rowToCommunitySighting(row: CommunityRow): Sighting {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    category: row.category as Category,
    commonName: row.common_name,
    scientificName: row.scientific_name ?? undefined,
    confidence: 1,
    rarity: row.rarity as Rarity,
    xp: row.xp,
    captiveStatus: row.captive_status as CaptiveStatus,
    sensitivity: row.sensitivity as SensitivityLevel,
    privatePhotoUri: '',
    publicImageUri: row.public_image_uri,
    publicLocation: {
      lat: row.public_lat ?? 0,
      lng: row.public_lng ?? 0,
      precisionMeters: row.public_precision_m ?? 0,
      hidden: row.location_hidden ?? false,
    },
    card: row.card,
    moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
  };
}
