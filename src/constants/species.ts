/**
 * Shared species-count constants used by completion tracking.
 *
 * TOTAL_SPECIES_COUNT mirrors the number of rows in supabase/seed.sql so the
 * completion percentage reflects the actual known species catalogue. Update this
 * when you add new species_rules rows.
 */

/** Total number of known species in the LifeDex catalogue (matches seed.sql). */
export const TOTAL_SPECIES_COUNT = 15;
