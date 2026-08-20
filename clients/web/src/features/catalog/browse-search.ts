// The `?sort=&genre=` query string shared by the Films and Series browse pages
// (both render the same <BrowseBar> over a different catalogue view).

import { SORT_MODES, type SortMode } from '@kroma/core';
import { z } from 'zod';

const MAX_GENRE_LENGTH = 64;

const BrowseSearchParams = z
  .object({
    sort: z.enum(SORT_MODES).optional().catch(undefined),
    genre: z.string().min(1).max(MAX_GENRE_LENGTH).optional().catch(undefined),
  })
  .catch({});

export interface BrowseSearch {
  sort?: SortMode;
  genre?: string;
}

/** Validate a browse route's search params, dropping anything unrecognized so a
 * hand-typed url can never put the page into an unknown state. A dropped key is
 * absent, not `undefined`, so it does not round-trip back into the url. */
export function validateBrowseSearch(s: Record<string, unknown>): BrowseSearch {
  const { sort, genre } = BrowseSearchParams.parse(s);
  const out: BrowseSearch = {};
  if (sort) out.sort = sort;
  if (genre) out.genre = genre;
  return out;
}
