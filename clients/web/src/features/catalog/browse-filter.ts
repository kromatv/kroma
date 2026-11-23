import {
  genreOfSegment,
  hasGenre,
  type LanguageFilter,
  matchesLanguages,
  type Sortable,
  type Spoken,
} from '@kromatv/core';

export interface BrowseFilter extends LanguageFilter {
  genre?: string;
}

/** The titles every picked filter keeps. `genre` is a url segment, the two
 * languages are codes in any spelling the files use. */
export function filterTitles<T extends Sortable & Spoken>(
  items: readonly T[],
  filter: BrowseFilter,
): T[] {
  return items.filter((item) => keeps(item, filter));
}

function keeps(item: Sortable & Spoken, { genre, ...languages }: BrowseFilter): boolean {
  return (!genre || hasGenre(item, genreOfSegment(genre))) && matchesLanguages(item, languages);
}
