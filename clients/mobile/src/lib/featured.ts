import type { ContinueItem, SectionItem } from '@kroma/client/media';
import { formatRuntime, genreLabels, type Translate } from '@kroma/core';

const MAX_GENRES = 2;
const SHOW_PROGRESS_SCALE = 100;

const ratio = (position: number, total: number): number | null =>
  position > 0 && total > 0 ? Math.min(position / total, 1) : null;

/** The line under the billboard's title: year, runtime, age rating and up to
 *  two genres, each left out where the catalogue has none. Empty for a title
 *  carrying none of them. */
export function featuredMetaLine(t: Translate, entry: SectionItem): string {
  const title = entry.type === 'movie' ? entry.item : entry.show;
  return [
    title.year ? String(title.year) : '',
    entry.type === 'movie' ? formatRuntime(entry.item.durationMs) : '',
    title.metadata?.certification ?? '',
    ...genreLabels(t, title.metadata).slice(0, MAX_GENRES),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** How far into the featured title the viewer already is, 0..1, or null while
 *  they have not started it. A series carries its own progress; a movie's comes
 *  off the resume rail. */
export function featuredProgress(
  entry: SectionItem,
  resumable: readonly ContinueItem[],
): number | null {
  if (entry.type === 'show') return ratio(entry.show.progress ?? 0, SHOW_PROGRESS_SCALE);
  const at = resumable.find((item) => item.item.id === entry.item.id);
  if (!at) return null;
  return ratio(at.positionMs, at.durationMs ?? entry.item.durationMs ?? 0);
}
