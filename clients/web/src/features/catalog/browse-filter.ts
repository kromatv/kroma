import { genreOfSegment, hasGenre, hasLanguage, type Sortable, type Spoken } from '@kromatv/core';

export interface BrowseFilter {
  genre?: string;
  audio?: string;
  subtitles?: string;
}

/** The titles every picked filter keeps. `genre` is a url segment, the two
 * languages are codes in any spelling the files use. */
export function filterTitles<T extends Sortable & Spoken>(
  items: readonly T[],
  filter: BrowseFilter,
): T[] {
  return items.filter((item) => keeps(item, filter));
}

function keeps(item: Sortable & Spoken, { genre, audio, subtitles }: BrowseFilter): boolean {
  if (genre && !hasGenre(item, genreOfSegment(genre))) {
    return false;
  }
  if (audio && !hasLanguage(item, 'audio', audio)) {
    return false;
  }
  return !subtitles || hasLanguage(item, 'subtitles', subtitles);
}
