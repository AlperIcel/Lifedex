/**
 * buildCardMetadata — assembles a CardMetadata value from a RecognitionResult
 * and ScoreResult. This is the single place that translates raw AI output + score
 * into the structured data stored on every card.
 *
 * HARD RULES enforced here:
 * - safetyNotes are injected automatically for protected/sensitive species and
 *   zoo/captive animals so they always appear on the card.
 * - No original photo URI, GPS, or personal data enters this function.
 */
import type { CardMetadata, RecognitionResult, ScoreResult } from '@/domain/types';

/* ------------------------------------------------------------------ */
/* Description generator                                              */
/* ------------------------------------------------------------------ */

const CATEGORY_INTROS: Record<string, string> = {
  animal: 'A living creature',
  plant: 'A plant species',
  tree: 'A tree',
  mushroom: 'A fungus',
  unknown: 'A living organism',
};

function buildDescription(recognition: RecognitionResult, rarity: string): string {
  const intro = CATEGORY_INTROS[recognition.category] ?? 'A living organism';
  const sciPart = recognition.scientificName
    ? ` (${recognition.scientificName})`
    : '';
  const rarityLabel =
    rarity === 'legendary' || rarity === 'epic'
      ? `This is an exceptionally ${rarity} find.`
      : rarity === 'rare'
      ? 'A rare sighting worth celebrating.'
      : 'A wonderful discovery from the natural world.';
  return `${intro}${sciPart} — ${recognition.commonName}. ${rarityLabel}`;
}

/* ------------------------------------------------------------------ */
/* Safety-note builder                                                */
/* ------------------------------------------------------------------ */

const SENSITIVITY_NOTES: Record<string, string> = {
  sensitive:
    'Keep a respectful distance. Avoid loud noises and sudden movements near this species.',
  protected:
    'This species is legally protected. Do not disturb, collect, or approach nesting areas. Exact location is hidden.',
};

const CAPTIVE_NOTES: Record<string, string> = {
  zoo_captive:
    'Sighting recorded as zoo/captive. XP is reduced; captive animals are tracked separately from wild populations.',
  domestic:
    'Domestic animal detected. Counted as a separate captive category; wild sightings are tracked independently.',
};

function buildSafetyNotes(
  sensitivity: RecognitionResult['sensitivity'],
  captiveStatus: RecognitionResult['captiveStatus'],
): string[] | undefined {
  const notes: string[] = [];

  const sensitivityNote = SENSITIVITY_NOTES[sensitivity];
  if (sensitivityNote !== undefined) {
    notes.push(sensitivityNote);
  }

  const captiveNote = CAPTIVE_NOTES[captiveStatus];
  if (captiveNote !== undefined) {
    notes.push(captiveNote);
  }

  return notes.length > 0 ? notes : undefined;
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Builds a CardMetadata object from recognition output and the scoring result.
 * All fields come from the two inputs — no side effects, no I/O.
 */
export function buildCardMetadata(
  recognition: RecognitionResult,
  score: ScoreResult,
): CardMetadata {
  const { commonName, category, confidence, captiveStatus, sensitivity } = recognition;
  const { rarity, xp } = score;

  const stats: Record<string, number | string> = {
    rarity,
    'confidence%': Math.round(confidence * 100),
    captive: captiveStatus !== 'wild' ? 'Yes' : 'No',
  };

  return {
    name: commonName,
    category,
    rarity,
    xp,
    description: buildDescription(recognition, rarity),
    stats,
    safetyNotes: buildSafetyNotes(sensitivity, captiveStatus),
  };
}
