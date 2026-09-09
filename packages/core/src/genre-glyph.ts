// The genre table's glyph, looked up by slug alone.
//
// Separate from `genre.ts` because of what that module IMPORTS rather than what
// it computes: resolving a genre written as a display name matches it against
// every locale's copy, so `genre.ts` reaches for the catalogs, and anything that
// touches the module pays for them. `@kromatv/ui`'s `genreIcon` only ever gets a
// slug, and the published kit must not carry an app's catalogs to draw an icon.

import { GENRES, type GenreRow } from './genre-table';
import { slugify as fold } from './slug';

const BY_SLUG: ReadonlyMap<string, GenreRow> = new Map(
  GENRES.map((genre) => [genre.slug, genre] as const),
);

/** The row a SLUG denotes. A display name resolves through `findGenre`, which
 *  reads the catalogs. */
export function genreRowOfSlug(slug: string): GenreRow | undefined {
  return BY_SLUG.get(fold(slug));
}

/** The glyph the design gives a genre, by slug. */
export function genreGlyphOfSlug(slug: string): string | undefined {
  return genreRowOfSlug(slug)?.glyph;
}
