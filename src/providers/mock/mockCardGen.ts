/**
 * Mock CardImageGenerationProvider — no network, no API keys.
 *
 * Returns a deterministic placeholder URI. In the real app this would call an
 * image-generation API; here we encode enough context into the URI so the UI
 * can render a styled placeholder card without any assets on disk.
 *
 * Format of the returned URI:
 *   mock-card://<category>/<slug>/<rarity>/<xp>
 *
 * The UI layer (CardImage component) recognises the `mock-card://` scheme and
 * renders a coloured placeholder instead of fetching a real image.
 *
 * Because the URI embeds the card name as a URL-safe slug the output is stable
 * across calls (same input → same URI) which lets tests assert on it.
 */
import type { CardMetadata, RecognitionResult } from '../../domain/types';
import type { CardImageGenerationProvider } from '../interfaces';

/** Converts a display name to a lowercase URL-safe slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class MockCardGenProvider implements CardImageGenerationProvider {
  async generateCard(
    meta: CardMetadata,
    _recognition: RecognitionResult,
  ): Promise<{ publicImageUri: string }> {
    const slug = slugify(meta.name);
    const publicImageUri = `mock-card://${meta.category}/${slug}/${meta.rarity}/${meta.xp}`;
    return { publicImageUri };
  }
}
