import type { TitleEdit } from '@kromatv/client/media';

/** Names a form holds for a list: null while the list follows the `.nfo` file
 * or the provider. */
export type Names = readonly string[] | null;

/** A title's hand-written fields as a form holds them: plain text, the year or
 * the full release date in one field, and the genres, the directors and the
 * studios as names. */
export interface TitleDraft {
  title: string;
  originalTitle: string;
  sortTitle: string;
  tagline: string;
  overview: string;
  released: string;
  genres: Names;
  directors: Names;
  studios: Names;
  contentRating: string;
}

const shown = (text: string | null) => text ?? '';

/** The form's text for what was written about a title, but its cast. */
export function draftOf(edit: Omit<TitleEdit, 'cast'>): TitleDraft {
  return {
    title: shown(edit.title),
    originalTitle: shown(edit.originalTitle),
    sortTitle: shown(edit.sortTitle),
    tagline: shown(edit.tagline),
    overview: shown(edit.overview),
    released: edit.released ?? (edit.year === null ? '' : String(edit.year)),
    genres: edit.genres,
    directors: edit.directors,
    studios: edit.studios,
    contentRating: shown(edit.contentRating),
  };
}

const kept = (text: string) => text.trim() || null;

function listOf(names: Names): string[] | null {
  const trimmed = (names ?? []).map((name) => name.trim()).filter(Boolean);
  return trimmed.length > 0 ? trimmed : null;
}

function dateOf(text: string): Pick<TitleEdit, 'year' | 'released'> {
  const date = text.trim();
  if (date === '') {
    return { year: null, released: null };
  }
  if (/^\d{1,4}$/.test(date)) {
    return { year: Number.parseInt(date, 10), released: null };
  }
  return { year: null, released: date };
}

/** The edit a form asks for, but its cast, with each field left empty handed
 * back to the provider. A full date goes as the release date, and the server
 * takes the year from it. */
export function editOf(draft: TitleDraft): Omit<TitleEdit, 'cast'> {
  return {
    title: kept(draft.title),
    originalTitle: kept(draft.originalTitle),
    sortTitle: kept(draft.sortTitle),
    tagline: kept(draft.tagline),
    overview: kept(draft.overview),
    ...dateOf(draft.released),
    genres: listOf(draft.genres),
    directors: listOf(draft.directors),
    studios: listOf(draft.studios),
    contentRating: kept(draft.contentRating),
  };
}

/** The names a list field shows: those the form holds, else those the page
 * shows, unless the page shows names that were written and then reset, which
 * the provider's own replace only once saved. */
export function namesShown(
  held: Names,
  { page, wasWritten }: Readonly<{ page: readonly string[]; wasWritten: boolean }>,
) {
  if (held !== null) {
    return held;
  }
  return wasWritten ? [] : page;
}
