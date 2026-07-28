/**
 * Shared species-count constants used by completion tracking.
 *
 * TOTAL_SPECIES_COUNT is derived from the live on-device catalogue
 * (`SPECIES_RULES`) so it can NEVER drift from reality. The old hardcoded 15
 * mirrored a stale supabase/seed.sql and understated the catalogue (~48),
 * capping the collection fantasy far too early.
 *
 * NOTE (roadmap): this is the interim "known catalogue" target. The Living-Dex
 * revamp replaces this flat number with a regional/biome Dex whose target is the
 * local species pool — see STATUS.md release plan.
 */
import { SPECIES_RULES } from '@/domain/speciesRules';

/** Total number of known species in the on-device LifeDex catalogue. */
export const TOTAL_SPECIES_COUNT = SPECIES_RULES.length;
