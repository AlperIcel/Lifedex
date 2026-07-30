/**
 * accessibility — where a catch was made, and what that means downstream.
 *
 * The recogniser (iNaturalist CV, PlantNet) cannot tell a wild plant growing
 * outdoors from a potted houseplant, or a wild animal from a pet — it defaults
 * every catch to `captiveStatus: 'wild'` (see inatMapping.ts / plantnetMapping.ts).
 * So we let the PLAYER say where they found it at capture time. That single
 * choice drives three things, all funnelled through the existing `captiveStatus`
 * field so nothing else in the economy/map needs a new concept:
 *
 *   1. Rarity/XP — a home find is capped like any 'domestic' catch (scoring.ts).
 *   2. Map — a home find is marked "not reachable" (others can't go find it).
 *   3. Privacy — a home find is never shared to the community feed/map (its
 *      location is the player's home).
 *
 * Pure, deterministic, no I/O — mirrors the other src/domain modules.
 */
import type { CaptiveStatus } from './types';

/** The player's "where did you find it?" choice at capture time. */
export type FindSetting = 'outdoors' | 'home';

/**
 * The effective `captiveStatus` for a catch, from the recogniser's guess plus
 * the player's choice.
 *
 * - `'home'` forces `'domestic'` — a houseplant/pet: capped rarity, private,
 *   not publicly huntable.
 * - `'outdoors'` (or unset) RESPECTS the recogniser's value. That's usually
 *   `'wild'`, but a mock cat/dog stays `'domestic'` — a pet is domestic wherever
 *   it's photographed, so we never UPGRADE to wild.
 */
export function resolveCaptiveStatus(
  recognised: CaptiveStatus,
  findSetting: FindSetting | undefined,
): CaptiveStatus {
  return findSetting === 'home' ? 'domestic' : recognised;
}

/**
 * Whether a catch is out in public where ANOTHER player could realistically go
 * find one too. Only truly wild finds are publicly reachable; a 'domestic'
 * (at-home) or 'zoo_captive' catch is not — the map marks those "not reachable",
 * and a future shared map must not publish their location.
 */
export function isPubliclyReachable(captiveStatus: CaptiveStatus): boolean {
  return captiveStatus === 'wild';
}
