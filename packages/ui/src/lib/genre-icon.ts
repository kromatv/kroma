import { genreGlyphOfSlug } from '@kromatv/core';
import { hasGlyph, type IconName } from '#ui/lib/glyph';

/** The icon for a genre SLUG, or `undefined` when the table has none for it,
 * or the build's glyph subset does not ship the one it names. */
export function genreIcon(slug: string): IconName | undefined {
  const glyph = genreGlyphOfSlug(slug);
  return glyph !== undefined && hasGlyph(glyph) ? glyph : undefined;
}
