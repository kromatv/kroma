import { ItemId, ShowId, type SubjectId } from '@kroma/core';

export const TMDB_PREFIX = 'tmdb:';

/**
 * The id a title is bookmarked and marked watched under. Its library id once it
 * has one, `tmdb:<id>` before that, so both memberships survive the rescan that
 * brings the title into the library. Null for a title with neither.
 */
export function savedTitleId(
  kind: 'movie' | 'show',
  localId: string | null | undefined,
  tmdbId: number | null,
): SubjectId | null {
  const id = localId || (tmdbId != null ? `${TMDB_PREFIX}${tmdbId}` : null);
  if (!id) return null;
  return kind === 'show' ? ShowId.parse(id) : ItemId.parse(id);
}
