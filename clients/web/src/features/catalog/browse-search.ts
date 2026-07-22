// The `?sort=&genre=` query string shared by the Films and Series browse pages
// (both render the same <BrowseBar> over a different catalogue view).

import { isSortMode, type SortMode } from '@kroma/core';

/** Browse-page search params: an optional sort mode and genre filter. */
export interface BrowseSearch {
  sort?: SortMode;
  genre?: string;
}

/** Validate a browse route's search params, dropping anything unrecognized so a
 * hand-typed url can never put the page into an unknown state. */
export function validateBrowseSearch(s: Record<string, unknown>): BrowseSearch {
  const out: BrowseSearch = {};
  if (isSortMode(s.sort)) out.sort = s.sort;
  if (typeof s.genre === 'string' && s.genre) out.genre = s.genre;
  return out;
}
