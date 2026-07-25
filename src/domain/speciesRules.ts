/**
 * Species rules — the on-device rarity + protection catalogue.
 *
 * This is the missing link that makes the game economy AND the protected-species
 * privacy work on REAL captures (not just seed data). A recognized species is
 * matched here (by scientific name, else common name) to get:
 *   - baseRarity  → drives XP/rarity (so epic/legendary are reachable for the
 *                   species that deserve it, not capped at 'rare')
 *   - sensitivity → drives location fuzzing/hiding (so a protected species is
 *                   actually hidden in real mode, not left at 'none')
 *
 * Sensitivity is deliberately conservative for at-risk taxa (owls, orchids,
 * kingfishers, snakes, otters…) so their exact location never becomes public.
 * Values for the seed/mock species mirror their existing sensitivity so mock
 * behaviour is unchanged.
 *
 * This is a curated starter catalogue; production should back it with a proper
 * dataset (GBIF / regional red lists) synced into supabase `species_rules`.
 */
import type { Category, Rarity, RecognitionResult, SensitivityLevel } from './types';

export interface SpeciesRuleEntry {
  commonName: string;
  scientificName?: string;
  category: Category;
  baseRarity: Rarity;
  sensitivity: SensitivityLevel;
}

/* Rarity guidance: common = everyday; uncommon = takes a walk; rare = a good day;
   epic = a lucky sighting; legendary = protected/iconic. */
export const SPECIES_RULES: SpeciesRuleEntry[] = [
  // ── Birds ────────────────────────────────────────────────────────────────
  { commonName: 'European Robin', scientificName: 'Erithacus rubecula', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Blackbird', scientificName: 'Turdus merula', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Great Tit', scientificName: 'Parus major', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Mallard', scientificName: 'Anas platyrhynchos', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Great Spotted Woodpecker', scientificName: 'Dendrocopos major', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'Common Kingfisher', scientificName: 'Alcedo atthis', category: 'animal', baseRarity: 'epic', sensitivity: 'protected' },
  { commonName: 'Barn Owl', scientificName: 'Tyto alba', category: 'animal', baseRarity: 'epic', sensitivity: 'protected' },
  { commonName: 'Eagle Owl', scientificName: 'Bubo bubo', category: 'animal', baseRarity: 'epic', sensitivity: 'protected' },
  { commonName: 'Red Kite', scientificName: 'Milvus milvus', category: 'animal', baseRarity: 'epic', sensitivity: 'protected' },
  { commonName: 'White Stork', scientificName: 'Ciconia ciconia', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  // ── Mammals ──────────────────────────────────────────────────────────────
  { commonName: 'Red Fox', scientificName: 'Vulpes vulpes', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'European Hedgehog', scientificName: 'Erinaceus europaeus', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'Grey Squirrel', scientificName: 'Sciurus carolinensis', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Red Squirrel', scientificName: 'Sciurus vulgaris', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'Roe Deer', scientificName: 'Capreolus capreolus', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'Red Deer', scientificName: 'Cervus elaphus', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'Wild Boar', scientificName: 'Sus scrofa', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'European Otter', scientificName: 'Lutra lutra', category: 'animal', baseRarity: 'legendary', sensitivity: 'protected' },
  { commonName: 'European Badger', scientificName: 'Meles meles', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  // ── Domestic (capped by captiveStatus anyway) ────────────────────────────
  { commonName: 'Domestic Cat', scientificName: 'Felis catus', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Domestic Dog', scientificName: 'Canis familiaris', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  // ── Amphibians / reptiles ────────────────────────────────────────────────
  { commonName: 'Common Frog', scientificName: 'Rana temporaria', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Toad', scientificName: 'Bufo bufo', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'Grass Snake', scientificName: 'Natrix natrix', category: 'animal', baseRarity: 'rare', sensitivity: 'protected' },
  { commonName: 'Common Lizard', scientificName: 'Zootoca vivipara', category: 'animal', baseRarity: 'uncommon', sensitivity: 'sensitive' },
  // ── Insects ──────────────────────────────────────────────────────────────
  { commonName: 'Honey Bee', scientificName: 'Apis mellifera', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Buff-tailed Bumblebee', scientificName: 'Bombus terrestris', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Seven-spot Ladybird', scientificName: 'Coccinella septempunctata', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Peacock Butterfly', scientificName: 'Aglais io', category: 'animal', baseRarity: 'uncommon', sensitivity: 'none' },
  // ── Plants / flowers ─────────────────────────────────────────────────────
  { commonName: 'Common Dandelion', scientificName: 'Taraxacum officinale', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Daisy', scientificName: 'Bellis perennis', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Nettle', scientificName: 'Urtica dioica', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Sunflower', scientificName: 'Helianthus annuus', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Poppy', scientificName: 'Papaver rhoeas', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Foxglove', scientificName: 'Digitalis purpurea', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: "Lady's Slipper Orchid", scientificName: 'Cypripedium calceolus', category: 'plant', baseRarity: 'legendary', sensitivity: 'protected' },
  { commonName: 'Early Purple Orchid', scientificName: 'Orchis mascula', category: 'plant', baseRarity: 'epic', sensitivity: 'protected' },
  // ── Trees ────────────────────────────────────────────────────────────────
  { commonName: 'English Oak', scientificName: 'Quercus robur', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Silver Birch', scientificName: 'Betula pendula', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Beech', scientificName: 'Fagus sylvatica', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Scots Pine', scientificName: 'Pinus sylvestris', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Horse Chestnut', scientificName: 'Aesculus hippocastanum', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Yew', scientificName: 'Taxus baccata', category: 'tree', baseRarity: 'uncommon', sensitivity: 'low' },
  // ── Mushrooms ────────────────────────────────────────────────────────────
  { commonName: 'Fly Agaric', scientificName: 'Amanita muscaria', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Chanterelle', scientificName: 'Cantharellus cibarius', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'King Bolete', scientificName: 'Boletus edulis', category: 'mushroom', baseRarity: 'rare', sensitivity: 'none' },
  { commonName: 'Death Cap', scientificName: 'Amanita phalloides', category: 'mushroom', baseRarity: 'rare', sensitivity: 'none' },
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Indexes for O(1) lookup by scientific name and common name.
const byScientific = new Map<string, SpeciesRuleEntry>();
const byCommon = new Map<string, SpeciesRuleEntry>();
for (const rule of SPECIES_RULES) {
  if (rule.scientificName !== undefined) byScientific.set(norm(rule.scientificName), rule);
  byCommon.set(norm(rule.commonName), rule);
}

/** Match a recognition to a curated rule (scientific name preferred). */
export function resolveSpeciesRule(
  commonName: string,
  scientificName?: string,
): SpeciesRuleEntry | undefined {
  if (scientificName !== undefined && scientificName.length > 0) {
    const hit = byScientific.get(norm(scientificName));
    if (hit !== undefined) return hit;
  }
  return byCommon.get(norm(commonName));
}

/** Species baseRarity for the scoring resolver (undefined → engine falls back). */
export function rarityForRecognition(recognition: RecognitionResult): Rarity | undefined {
  return resolveSpeciesRule(recognition.commonName, recognition.scientificName)?.baseRarity;
}

/**
 * Override a recognition's sensitivity from the species rule so protected/at-risk
 * species are actually hidden/fuzzed — even when the recognition provider (e.g.
 * Google Vision) reported 'none'. Unmatched species keep their reported value.
 */
export function applySpeciesRule(recognition: RecognitionResult): RecognitionResult {
  const rule = resolveSpeciesRule(recognition.commonName, recognition.scientificName);
  if (rule === undefined) return recognition;
  return { ...recognition, sensitivity: rule.sensitivity };
}
