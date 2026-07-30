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
 *
 * SCALE: the catalogue covers ~48 species; the recogniser knows hundreds of
 * thousands. Everything it does NOT cover now falls through to real observation
 * frequency (`observationRarity.ts`) rather than to a rare-capped guess — see
 * `rarityForRecognition` for the full priority chain.
 */
import { rarityFromObservationCount } from './observationRarity';
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
  { commonName: 'Eurasian Blue Tit', scientificName: 'Cyanistes caeruleus', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Eurasian Magpie', scientificName: 'Pica pica', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Carrion Crow', scientificName: 'Corvus corone', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Wood Pigeon', scientificName: 'Columba palumbus', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Eurasian Collared Dove', scientificName: 'Streptopelia decaocto', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'House Sparrow', scientificName: 'Passer domesticus', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Starling', scientificName: 'Sturnus vulgaris', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Chaffinch', scientificName: 'Fringilla coelebs', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'European Greenfinch', scientificName: 'Chloris chloris', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'European Goldfinch', scientificName: 'Carduelis carduelis', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Eurasian Nuthatch', scientificName: 'Sitta europaea', category: 'animal', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Eurasian Wren', scientificName: 'Troglodytes troglodytes', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Buzzard', scientificName: 'Buteo buteo', category: 'animal', baseRarity: 'uncommon', sensitivity: 'protected' },
  { commonName: 'Eurasian Kestrel', scientificName: 'Falco tinnunculus', category: 'animal', baseRarity: 'uncommon', sensitivity: 'protected' },
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
  { commonName: 'Eurasian Beaver', scientificName: 'Castor fiber', category: 'animal', baseRarity: 'rare', sensitivity: 'protected' },
  { commonName: 'Pine Marten', scientificName: 'Martes martes', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'Brown Hare', scientificName: 'Lepus europaeus', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'European Rabbit', scientificName: 'Oryctolagus cuniculus', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Pipistrelle', scientificName: 'Pipistrellus pipistrellus', category: 'animal', baseRarity: 'uncommon', sensitivity: 'protected' },
  { commonName: 'European Mole', scientificName: 'Talpa europaea', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  // ── Domestic (capped by captiveStatus anyway) ────────────────────────────
  { commonName: 'Domestic Cat', scientificName: 'Felis catus', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Domestic Dog', scientificName: 'Canis familiaris', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  // ── Amphibians / reptiles ────────────────────────────────────────────────
  { commonName: 'Common Frog', scientificName: 'Rana temporaria', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Toad', scientificName: 'Bufo bufo', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'Grass Snake', scientificName: 'Natrix natrix', category: 'animal', baseRarity: 'rare', sensitivity: 'protected' },
  { commonName: 'Common Lizard', scientificName: 'Zootoca vivipara', category: 'animal', baseRarity: 'uncommon', sensitivity: 'sensitive' },
  { commonName: 'Fire Salamander', scientificName: 'Salamandra salamandra', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'Slow Worm', scientificName: 'Anguis fragilis', category: 'animal', baseRarity: 'uncommon', sensitivity: 'sensitive' },
  { commonName: 'European Green Lizard', scientificName: 'Lacerta viridis', category: 'animal', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'Smooth Newt', scientificName: 'Lissotriton vulgaris', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  // ── Insects ──────────────────────────────────────────────────────────────
  { commonName: 'Honey Bee', scientificName: 'Apis mellifera', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Buff-tailed Bumblebee', scientificName: 'Bombus terrestris', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Seven-spot Ladybird', scientificName: 'Coccinella septempunctata', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Peacock Butterfly', scientificName: 'Aglais io', category: 'animal', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Small Tortoiseshell', scientificName: 'Aglais urticae', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Red Admiral', scientificName: 'Vanessa atalanta', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Small White', scientificName: 'Pieris rapae', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Large White', scientificName: 'Pieris brassicae', category: 'animal', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Blue', scientificName: 'Polyommatus icarus', category: 'animal', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Emperor Dragonfly', scientificName: 'Anax imperator', category: 'animal', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'European Hornet', scientificName: 'Vespa crabro', category: 'animal', baseRarity: 'uncommon', sensitivity: 'low' },
  // ── Plants / flowers ─────────────────────────────────────────────────────
  { commonName: 'Common Dandelion', scientificName: 'Taraxacum officinale', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Daisy', scientificName: 'Bellis perennis', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Nettle', scientificName: 'Urtica dioica', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Sunflower', scientificName: 'Helianthus annuus', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Poppy', scientificName: 'Papaver rhoeas', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Foxglove', scientificName: 'Digitalis purpurea', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: "Lady's Slipper Orchid", scientificName: 'Cypripedium calceolus', category: 'plant', baseRarity: 'legendary', sensitivity: 'protected' },
  { commonName: 'Early Purple Orchid', scientificName: 'Orchis mascula', category: 'plant', baseRarity: 'epic', sensitivity: 'protected' },
  { commonName: 'Ribwort Plantain', scientificName: 'Plantago lanceolata', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Broad-leaved Plantain', scientificName: 'Plantago major', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'White Clover', scientificName: 'Trifolium repens', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Red Clover', scientificName: 'Trifolium pratense', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Creeping Buttercup', scientificName: 'Ranunculus repens', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Meadow Buttercup', scientificName: 'Ranunculus acris', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Yarrow', scientificName: 'Achillea millefolium', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Ground Ivy', scientificName: 'Glechoma hederacea', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'European Blackberry', scientificName: 'Rubus fruticosus', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Hogweed', scientificName: 'Heracleum sphondylium', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Herb Robert', scientificName: 'Geranium robertianum', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Chickweed', scientificName: 'Stellaria media', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Cow Parsley', scientificName: 'Anthriscus sylvestris', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Oxeye Daisy', scientificName: 'Leucanthemum vulgare', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Sweet Woodruff', scientificName: 'Galium odoratum', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Lesser Celandine', scientificName: 'Ranunculus ficaria', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Snowdrop', scientificName: 'Galanthus nivalis', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Cowslip', scientificName: 'Primula veris', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Bluebell', scientificName: 'Hyacinthoides non-scripta', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Wild Garlic', scientificName: 'Allium ursinum', category: 'plant', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Lily of the Valley', scientificName: 'Convallaria majalis', category: 'plant', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: "Snake's-head Fritillary", scientificName: 'Fritillaria meleagris', category: 'plant', baseRarity: 'rare', sensitivity: 'protected' },
  // ── Trees ────────────────────────────────────────────────────────────────
  { commonName: 'English Oak', scientificName: 'Quercus robur', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Silver Birch', scientificName: 'Betula pendula', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Beech', scientificName: 'Fagus sylvatica', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Scots Pine', scientificName: 'Pinus sylvestris', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Horse Chestnut', scientificName: 'Aesculus hippocastanum', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Yew', scientificName: 'Taxus baccata', category: 'tree', baseRarity: 'uncommon', sensitivity: 'low' },
  { commonName: 'Sessile Oak', scientificName: 'Quercus petraea', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Norway Spruce', scientificName: 'Picea abies', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'European Larch', scientificName: 'Larix decidua', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'European Ash', scientificName: 'Fraxinus excelsior', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Field Maple', scientificName: 'Acer campestre', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Sycamore Maple', scientificName: 'Acer pseudoplatanus', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Norway Maple', scientificName: 'Acer platanoides', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Small-leaved Lime', scientificName: 'Tilia cordata', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'European Hornbeam', scientificName: 'Carpinus betulus', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Alder', scientificName: 'Alnus glutinosa', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'European Aspen', scientificName: 'Populus tremula', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Black Poplar', scientificName: 'Populus nigra', category: 'tree', baseRarity: 'rare', sensitivity: 'sensitive' },
  { commonName: 'White Willow', scientificName: 'Salix alba', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Goat Willow', scientificName: 'Salix caprea', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Hazel', scientificName: 'Corylus avellana', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Rowan', scientificName: 'Sorbus aucuparia', category: 'tree', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Sweet Chestnut', scientificName: 'Castanea sativa', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Wild Cherry', scientificName: 'Prunus avium', category: 'tree', baseRarity: 'uncommon', sensitivity: 'none' },
  // ── Mushrooms ────────────────────────────────────────────────────────────
  { commonName: 'Fly Agaric', scientificName: 'Amanita muscaria', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Chanterelle', scientificName: 'Cantharellus cibarius', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'King Bolete', scientificName: 'Boletus edulis', category: 'mushroom', baseRarity: 'rare', sensitivity: 'none' },
  { commonName: 'Death Cap', scientificName: 'Amanita phalloides', category: 'mushroom', baseRarity: 'rare', sensitivity: 'none' },
  { commonName: 'Common Puffball', scientificName: 'Lycoperdon perlatum', category: 'mushroom', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Shaggy Ink Cap', scientificName: 'Coprinus comatus', category: 'mushroom', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Field Mushroom', scientificName: 'Agaricus campestris', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Parasol Mushroom', scientificName: 'Macrolepiota procera', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Honey Fungus', scientificName: 'Armillaria mellea', category: 'mushroom', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Turkey Tail', scientificName: 'Trametes versicolor', category: 'mushroom', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Birch Polypore', scientificName: 'Piptoporus betulinus', category: 'mushroom', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Common Stinkhorn', scientificName: 'Phallus impudicus', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Jelly Ear', scientificName: 'Auricularia auricula-judae', category: 'mushroom', baseRarity: 'common', sensitivity: 'none' },
  { commonName: 'Panther Cap', scientificName: 'Amanita pantherina', category: 'mushroom', baseRarity: 'rare', sensitivity: 'none' },
  { commonName: 'Wood Blewit', scientificName: 'Lepista nuda', category: 'mushroom', baseRarity: 'uncommon', sensitivity: 'none' },
  { commonName: 'Common Morel', scientificName: 'Morchella esculenta', category: 'mushroom', baseRarity: 'rare', sensitivity: 'none' },
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

/**
 * Resolve the species-level rarity for a recognition, in priority order:
 *
 *   (a) the curated catalogue above — AUTHORITATIVE. A hand-checked entry always
 *       wins; it encodes protection status and local judgement that a raw
 *       observation count cannot.
 *   (b) the taxon's GLOBAL iNaturalist observation count, mapped through
 *       `rarityFromObservations`. This is what makes the economy scale past the
 *       ~48 curated species to everything the recogniser can return, and it is
 *       the only path through which epic/legendary is reachable for an
 *       uncurated species.
 *   (c) undefined — no catalogue entry AND no observation count (offline, or the
 *       provider supplies no taxon). The scoring engine then applies its generic
 *       category default, which is the ONLY place the 'rare' cap still bites.
 */
export function rarityForRecognition(recognition: RecognitionResult): Rarity | undefined {
  const curated = resolveSpeciesRule(
    recognition.commonName,
    recognition.scientificName,
  )?.baseRarity;
  if (curated !== undefined) return curated;
  return rarityFromObservationCount(recognition.observationsCount);
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
