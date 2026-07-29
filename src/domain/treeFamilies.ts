/**
 * Tree-vs-herb heuristic for real (non-mock) plant catches.
 *
 * iNaturalist's iconic taxa have no dedicated "tree" bucket — every vascular
 * plant, woody or herbaceous, carries `iconic_taxon_name: 'Plantae'` (see the
 * comment in `../providers/inaturalist/inatMapping.ts`). So an oak and a daisy
 * both start out on the same 'plant' bucket iNat gives us, and iNat's own
 * classification exposes no growth-habit field either.
 *
 * The one extra signal we get for free is the taxonomic FAMILY (read from the
 * taxon's `ancestors` — see `fetchTaxonInfo` in `../lib/inatObservations.ts`).
 * Some families are (almost) entirely trees or large woody shrubs; this module
 * is a curated, precision-first allowlist of those families.
 *
 * This intentionally DUPLICATES (rather than imports) the 8-family seed list
 * already used by the PlantNet mapper (`../providers/plantnet/plantnetMapping.ts`,
 * `TREE_FAMILIES`): domain code must not depend on one specific provider, and
 * both lists are meant to evolve independently from here on.
 *
 * KNOWN HEURISTIC LIMITATION — family is the ONLY signal available:
 *  - No family below is 100% tree. Oleaceae includes lilac and privet (shrubs);
 *    Betulaceae includes hazel (usually a large shrub, not a tree) and dwarf
 *    birch; Salicaceae includes prostrate alpine willows; Myrtaceae and
 *    Lauraceae both include shrub genera (Myrtus, Callistemon; Lindera);
 *    Arecaceae (palms) are colloquially "trees" for this game even though they
 *    have no secondary (wood-forming) growth in the strict botanical sense.
 *    A miss here only costs a card's category label — never safety, privacy or
 *    scoring correctness — so the list favours PRECISION over RECALL: a family
 *    is only added when the overwhelming majority of its commonly-encountered
 *    genera are unambiguously trees.
 *  - Deliberately EXCLUDED despite containing many trees:
 *      - Rosaceae (apples, cherries, hawthorn — but also strawberries, brambles,
 *        cinquefoils, roses: far too mixed to call from family alone).
 *      - Malvaceae (basswood/baobab in the modern APG placement — but also
 *        hibiscus, cotton, okra, mallows: mostly non-trees). Where the modern
 *        family would be Malvaceae but a legacy family name is still
 *        tree-dominated, the legacy name is listed instead (Tiliaceae,
 *        Aceraceae) — the same trick the PlantNet mapper already relies on.
 *  - No genus-level exception list: the taxon lookup only reads off the family
 *    (not the genus), and the product cost of a miss is low, so this is kept
 *    simple on purpose. If a specific genus becomes a recurring problem, add a
 *    small exception list then rather than reaching for per-genus logic in the
 *    provider ahead of need.
 */

/**
 * Families whose commonly-encountered genera are (overwhelmingly) trees or
 * large woody shrubs. Canonical case is Title Case; lookups via `isTreeFamily`
 * are case-insensitive and trimmed.
 */
export const TREE_FAMILIES: readonly string[] = [
  // --- seed list, shared in spirit with PlantNet's flora-only heuristic ---
  'Pinaceae', // pines, spruces, firs
  'Fagaceae', // oaks, beeches, chestnuts
  'Betulaceae', // birches, alders, hazels
  'Salicaceae', // willows, poplars
  'Aceraceae', // maples (legacy family name)
  'Sapindaceae', // maples, horse chestnuts (current placement)
  'Cupressaceae', // cypresses, junipers, redwoods
  'Oleaceae', // ashes, olives, lilacs

  // --- extended for the wider iNaturalist catch surface (fauna + fungi + flora) ---
  'Juglandaceae', // walnuts, hickories, pecans
  'Ulmaceae', // elms, hackberries, zelkovas
  'Platanaceae', // planes / sycamores (single genus, all trees)
  'Tiliaceae', // lindens / basswoods (legacy name; see header re: Malvaceae)
  'Myrtaceae', // eucalypts, guavas, bottlebrushes
  'Lauraceae', // laurels, avocado, cinnamon, sassafras
  'Arecaceae', // palms — colloquially "trees" for this game
  'Taxaceae', // yews
];

const TREE_FAMILY_SET = new Set(TREE_FAMILIES.map((f) => f.toLowerCase()));

/**
 * True when `family` (a taxonomic family name, any case/whitespace) is one of
 * the curated tree families above.
 *
 * False for `undefined`, empty/whitespace-only input, or any unrecognised
 * family — the caller's fallback in every one of those cases must stay
 * 'plant', never 'tree'.
 */
export function isTreeFamily(family?: string): boolean {
  if (family === undefined) return false;
  const trimmed = family.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  return TREE_FAMILY_SET.has(trimmed);
}
