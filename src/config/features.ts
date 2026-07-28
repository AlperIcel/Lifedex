/**
 * Feature flags — simple compile-time toggles for functionality that is built
 * but deliberately not live yet (see STATUS.md "Release plan": v1 ships
 * single-player only; community/ranks/accounts are cut to v1.1).
 *
 * Not env-driven on purpose: this isn't a per-deploy secret or config value,
 * it's a release-scope switch flipped by a code change (and reviewed as one).
 */
export const features = {
  /**
   * When false (v1 default), captured sightings are never pushed to the
   * community backend — the app is fully single-player. Flip to true for
   * v1.1 once server-side XP validation + a moderation queue exist
   * (see STATUS.md "Cut to v1.1+").
   */
  communitySharing: false,
} as const;
