import {
  hasGenre,
  type LanguageFilter,
  matchesLanguages,
  type Sortable,
  type Spoken,
} from '@kromatv/core';

/** The titles a catalogue tab shows: those of `genre` when one is picked, that
 * have every language `languages` asks for. */
export function narrowCatalogue<T extends Sortable & Spoken>(
  titles: readonly T[],
  genre: string | null,
  languages: LanguageFilter,
): T[] {
  return titles.filter(
    (title) => (genre === null || hasGenre(title, genre)) && matchesLanguages(title, languages),
  );
}
