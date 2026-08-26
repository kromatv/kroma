// Genre identity: one genre, however it was spelled when it reached us. A
// library stores whatever display name the enrichment language produced
// ("Family" or "Familial"), so a URL, a colour and a label all fold their
// input to a slug before matching.

import { GENRES, type GenreCopyKey, type GenreRow, type GenreSlug } from './genre-table';
import { SUPPORTED_LOCALES, type Translate, translate } from './i18n';
import { slugify as fold } from './slug';

export type { GenreRow, GenreSlug } from './genre-table';
export { GENRES } from './genre-table';

// The combining-marks range, not `\p{M}`: this module ships to the legacy webOS
// tier, whose engine cannot parse unicode property escapes.
function labelKey(slug: GenreSlug): GenreCopyKey {
  return `genre.${slug}`;
}

const BY_FOLD: ReadonlyMap<string, GenreRow> = new Map(
  GENRES.flatMap((genre) => [
    [genre.slug, genre] as const,
    ...[...SUPPORTED_LOCALES].map(
      (locale) => [fold(translate(locale, labelKey(genre.slug))), genre] as const,
    ),
  ]),
);

const BY_TMDB: ReadonlyMap<number, GenreRow> = new Map(
  GENRES.map((genre) => [genre.tmdb, genre] as const),
);

function rowOf(nameOrSlug: string): GenreRow | undefined {
  return BY_FOLD.get(fold(nameOrSlug));
}

/** The genre a stored display name or a URL slug denotes, in any language the
 * app ships copy for. `undefined` for a genre no provider list names, which is
 * never guessed at. */
export function findGenre(nameOrSlug: string): GenreSlug | undefined {
  return rowOf(nameOrSlug)?.slug;
}

export function genreOfTmdbId(id: number): GenreSlug | undefined {
  return BY_TMDB.get(id)?.slug;
}

export type TitleGenres = {
  readonly tmdbGenreIds?: readonly number[] | null;
  readonly genres?: readonly string[] | null;
};

// The ids and the names come from one TMDB list, so they align by index.
function rowsOf(title: TitleGenres | null | undefined): { row?: GenreRow; name: string }[] {
  const names = title?.genres ?? [];
  const ids = title?.tmdbGenreIds ?? [];
  const paired =
    ids.length === 0
      ? names.map((name) => ({ row: rowOf(name), name }))
      : ids.map((id, index) => {
          const name = names[index] ?? '';
          return { row: BY_TMDB.get(id) ?? rowOf(name), name };
        });
  return paired.filter(({ row, name }) => row !== undefined || fold(name) !== '');
}

/** A genre's stable identity, from a display name in any language the app
 * ships copy for or from a slug. Falls back to the folded name for a genre no
 * provider list names, and is idempotent, so a slug resolves to itself. */
export function genreSlug(nameOrSlug: string): string {
  return findGenre(nameOrSlug) ?? fold(nameOrSlug);
}

/** How a genre is addressed in a URL: the provider id when the app knows the
 * genre, so the link carries no language, and the folded name otherwise. */
export function genreSegment(nameOrSlug: string): string {
  const row = rowOf(nameOrSlug);
  return row ? String(row.tmdb) : fold(nameOrSlug);
}

/** The genre a URL segment denotes, reading a provider id, a slug, or a
 * display name a bookmark predates the ids with. Idempotent on a slug it has
 * no id for, so an unknown genre stays reachable. */
export function genreOfSegment(segment: string): string {
  const id = Number(segment);
  if (Number.isInteger(id) && segment.trim() !== '') {
    const slug = genreOfTmdbId(id);
    if (slug) return slug;
  }
  return genreSlug(segment);
}

/** The genre's name in the reader's language, falling back to the spelling
 * handed in for a genre the app has no copy for. */
export function genreLabel(t: Translate, nameOrSlug: string): string {
  const slug = findGenre(nameOrSlug);
  return slug ? t(labelKey(slug)) : nameOrSlug.trim();
}

/** The identity of each genre a title carries, read off the provider ids where
 * enrichment stored them and off the display names otherwise. */
export function genreSlugs(title: TitleGenres | null | undefined): string[] {
  return genreEntries(title).map(({ slug }) => slug);
}

/** Each genre a title carries, as the slug it resolves to paired with the
 * spelling it was stored with. Paired rather than two lists: a genre with
 * neither a row nor a foldable name is dropped, so a caller indexing the raw
 * `genres` array by position reads a neighbour's name. */
export function genreEntries(
  title: TitleGenres | null | undefined,
): { slug: string; name: string }[] {
  return rowsOf(title).map(({ row, name }) => ({ slug: row?.slug ?? fold(name), name }));
}

/** Each of a title's genres in the reader's language, falling back to the
 * spelling it was stored with for one the app has no copy for. */
export function genreLabels(t: Translate, title: TitleGenres | null | undefined): string[] {
  return rowsOf(title).map(({ row, name }) => (row ? t(labelKey(row.slug)) : name.trim()));
}

export function genreGlyph(nameOrSlug: string): string | undefined {
  return rowOf(nameOrSlug)?.glyph;
}
