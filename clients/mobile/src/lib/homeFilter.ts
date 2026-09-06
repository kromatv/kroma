import type { ContinueItem, MediaItem, SectionItem } from '@kroma/client/media';

/** What the home feed is narrowed to, or null for the whole catalogue. */
export type TitleFilter = 'movie' | 'show' | null;

const RESUME_KIND: Record<'movie' | 'show', MediaItem['kind']> = {
  movie: 'movie',
  show: 'episode',
};

/** A rail narrowed to one type, or the rail itself when there is no filter. An
 *  empty result is the caller's cue to drop the rail rather than draw a heading
 *  over nothing. */
export function filterEntries(entries: SectionItem[], filter: TitleFilter): SectionItem[] {
  if (filter === null) return entries;
  return entries.filter((entry) => entry.type === filter);
}

/** The resume rail narrowed the same way. An episode counts toward its series;
 *  a loose video belongs to neither type and falls out of both. */
export function filterResume(entries: ContinueItem[], filter: TitleFilter): ContinueItem[] {
  if (filter === null) return entries;
  return entries.filter((entry) => entry.item.kind === RESUME_KIND[filter]);
}
