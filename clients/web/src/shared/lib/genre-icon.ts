import { genreGlyph } from '@kroma/core';
import { hasGlyph, type IconName } from '@kroma/ui/kit';

/** The icon for a genre, or `undefined` when the table has none for it, or the
 * build's glyph subset does not ship the one it names. */
export function genreIcon(name: string): IconName | undefined {
  const glyph = genreGlyph(name);
  return glyph !== undefined && hasGlyph(glyph) ? glyph : undefined;
}
