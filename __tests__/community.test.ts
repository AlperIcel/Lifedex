/**
 * Tests for the community layer mappers + the Supabase enable flag.
 *
 * Network code (community.ts) is intentionally NOT tested here — it is guarded
 * and no-ops without Supabase. We test the pure mappers and that the app stays
 * fully local (useSupabase=false) when no env is configured.
 */
import {
  sightingToRow,
  rowToCommunitySighting,
  type CommunityRow,
} from '../src/lib/communityMappers';
import { env } from '../src/config/env';
import type { Sighting } from '../src/domain/types';

function sampleSighting(): Sighting {
  return {
    id: 'sighting-1',
    userId: 'me',
    createdAt: '2026-06-01T10:00:00.000Z',
    category: 'animal',
    commonName: 'Red Fox',
    scientificName: 'Vulpes vulpes',
    confidence: 0.88,
    rarity: 'uncommon',
    xp: 120,
    captiveStatus: 'wild',
    sensitivity: 'low',
    privatePhotoUri: 'file:///private/secret.jpg',
    publicImageUri: 'mock-card://animal/red-fox/uncommon/120',
    publicLocation: { lat: 48.1, lng: 11.5, precisionMeters: 500, hidden: false },
    card: {
      name: 'Red Fox',
      category: 'animal',
      rarity: 'uncommon',
      xp: 120,
      description: 'A cunning wild fox.',
      stats: { rarity: 'uncommon', confidence: '88%' },
    },
    moderation: { allowed: true, reasons: [], strippedRegions: [], qualityOk: true },
  };
}

describe('env.useSupabase', () => {
  it('is false with no Supabase env (app stays fully local)', () => {
    expect(env.useSupabase).toBe(false);
  });
});

describe('sightingToRow', () => {
  it('maps only public-safe fields', () => {
    const row = sightingToRow(sampleSighting(), 'user-123');
    expect(row.user_id).toBe('user-123');
    expect(row.common_name).toBe('Red Fox');
    expect(row.rarity).toBe('uncommon');
    expect(row.public_lat).toBe(48.1);
    expect(row.public_precision_m).toBe(500);
    expect(row.location_hidden).toBe(false);
    expect(row.card.name).toBe('Red Fox');
  });

  it('NEVER includes the private photo or exact-only fields', () => {
    const row = sightingToRow(sampleSighting(), 'user-123') as unknown as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain('secret.jpg');
    expect(row.privatePhotoUri).toBeUndefined();
    expect(row.private_photo_uri).toBeUndefined();
  });
});

describe('rowToCommunitySighting', () => {
  const row: CommunityRow = {
    id: 'uuid-1',
    user_id: 'other-user',
    created_at: '2026-06-02T12:00:00.000Z',
    category: 'plant',
    common_name: 'Common Dandelion',
    scientific_name: null,
    rarity: 'common',
    xp: 10,
    captive_status: 'wild',
    sensitivity: 'none',
    public_image_uri: 'mock-card://plant/common-dandelion/common/10',
    public_lat: 51.5,
    public_lng: -0.1,
    public_precision_m: 175,
    location_hidden: false,
    card: { name: 'Common Dandelion', category: 'plant', rarity: 'common', xp: 10, description: '', stats: {} },
  };

  it('rebuilds a display Sighting from a row', () => {
    const s = rowToCommunitySighting(row);
    expect(s.id).toBe('uuid-1');
    expect(s.userId).toBe('other-user');
    expect(s.commonName).toBe('Common Dandelion');
    expect(s.publicLocation).toEqual({ lat: 51.5, lng: -0.1, precisionMeters: 175, hidden: false });
    expect(s.privatePhotoUri).toBe(''); // never had it
    expect(s.scientificName).toBeUndefined();
  });

  it('treats null coordinates as a hidden/zero location', () => {
    const s = rowToCommunitySighting({ ...row, public_lat: null, public_lng: null, location_hidden: true });
    expect(s.publicLocation.lat).toBe(0);
    expect(s.publicLocation.hidden).toBe(true);
  });
});
