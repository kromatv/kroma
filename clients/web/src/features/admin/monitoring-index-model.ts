import type { LibraryTitle } from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { z } from 'zod';

export type LibraryKind = RequestKind | 'all';

/** The view the index opens on, read from the page's `view` search param:
 *  anything unknown falls back to every title. */
export const LibraryState = z
  .enum(['all', 'monitored', 'unmonitored', 'missing', 'continuing'])
  .catch('all');
export type LibraryState = z.infer<typeof LibraryState>;
export type LibrarySort = 'title' | 'year' | 'missing' | 'size' | 'added';

export interface LibraryFilter {
  kind: LibraryKind;
  state: LibraryState;
  needle: string;
  sort: LibrarySort;
  descending: boolean;
}

const CONTINUING = new Set(['Returning Series', 'In Production', 'Planned']);

function matchesState(row: LibraryTitle, state: LibraryState): boolean {
  if (state === 'monitored') return row.monitored;
  if (state === 'unmonitored') return !row.monitored;
  if (state === 'missing') return row.missing > 0;
  if (state === 'continuing') return CONTINUING.has(row.airStatus ?? '');
  return true;
}

function compare(a: LibraryTitle, b: LibraryTitle, sort: LibrarySort): number {
  if (sort === 'year') return (a.year ?? 0) - (b.year ?? 0);
  if (sort === 'missing') return a.missing - b.missing;
  if (sort === 'size') return a.sizeBytes - b.sizeBytes;
  if (sort === 'added') return (a.addedAt ?? '').localeCompare(b.addedAt ?? '');
  return a.title.localeCompare(b.title);
}

/** Ties fall back to the title, so a column of equal numbers still reads
 * alphabetically. */
export function filterLibrary(
  rows: readonly LibraryTitle[],
  filter: LibraryFilter,
): LibraryTitle[] {
  const needle = filter.needle.trim().toLocaleLowerCase();
  const kept = rows.filter(
    (row) =>
      (filter.kind === 'all' || row.kind === filter.kind) &&
      matchesState(row, filter.state) &&
      (!needle || row.title.toLocaleLowerCase().includes(needle)),
  );
  const turn = filter.descending ? -1 : 1;
  return kept.sort((a, b) => compare(a, b, filter.sort) * turn || a.title.localeCompare(b.title));
}

/** How much of what is monitored is on disk, as 0..1. Null when nothing is
 * monitored, which is not the same as nothing being held. */
export function heldRatio(row: LibraryTitle): number | null {
  if (row.monitoredUnits === 0) return null;
  return Math.min(row.available, row.monitoredUnits) / row.monitoredUnits;
}

export function titleKey(row: Pick<LibraryTitle, 'kind' | 'tmdbId' | 'localId' | 'title'>): string {
  return `${row.kind}:${row.tmdbId ?? row.localId ?? row.title}`;
}
