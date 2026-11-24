import type { TitleEdit } from '@kromatv/client/media';

/** A title's hand-written fields as a form holds them: plain text, with the
 * genres on one line. */
export interface TitleDraft {
  title: string;
  overview: string;
  year: string;
  genres: string;
}

/** The form's text for what was written about a title. */
export function draftOf(edit: TitleEdit): TitleDraft {
  return {
    title: edit.title ?? '',
    overview: edit.overview ?? '',
    year: edit.year === null ? '' : String(edit.year),
    genres: (edit.genres ?? []).join(', '),
  };
}

const kept = (text: string) => text.trim() || null;

/** The edit a form asks for, with each field left empty handed back to the
 * provider. */
export function editOf(draft: TitleDraft): TitleEdit {
  const year = Number.parseInt(draft.year, 10);
  const genres = draft.genres
    .split(',')
    .map((genre) => genre.trim())
    .filter(Boolean);
  return {
    title: kept(draft.title),
    overview: kept(draft.overview),
    year: Number.isNaN(year) ? null : year,
    genres: genres.length > 0 ? genres : null,
  };
}
