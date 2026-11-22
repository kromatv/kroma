import type { PlayEntry } from '@kromatv/client/admin';
import type { MessageKey } from '@kromatv/i18n';
import type { TableColumn } from '@kromatv/ui/kit';
import type { HistorySort } from '#web/features/admin/history-query';

export interface HistoryColumn extends TableColumn {
  column: HistorySort;
  labelKey: MessageKey;
}

export const HISTORY_COLUMNS: readonly HistoryColumn[] = [
  { column: 'username', labelKey: 'admin.colUser', flex: 1.1, min: 120 },
  { column: 'kind', labelKey: 'admin.colType', flex: 0.7, min: 96 },
  { column: 'title', labelKey: 'admin.colTitle', flex: 2, min: 200 },
  { column: 'player', labelKey: 'admin.colPlayer', flex: 1.1, min: 120 },
  { column: 'device', labelKey: 'admin.colPlatform', flex: 1, min: 120 },
  { column: 'endedAt', labelKey: 'admin.colWhen', flex: 1, min: 132 },
  { column: 'watchedMs', labelKey: 'admin.colWatched', flex: 0.9, min: 120 },
];

export const ITEM_HISTORY_COLUMNS: readonly HistoryColumn[] = HISTORY_COLUMNS.filter(
  (column) => column.column !== 'title',
);

export function kindKey(kind: string): MessageKey {
  return kind === 'movie' ? 'admin.kindMovie' : 'admin.kindTv';
}

export interface TitleLines {
  lead: string;
  detail: string | null;
}

export function titleLines(play: PlayEntry): TitleLines {
  if (!play.showTitle) {
    return { lead: play.title, detail: null };
  }
  const number = play.season == null ? null : `S${play.season}E${play.episode ?? '?'}`;
  return { lead: play.showTitle, detail: [number, play.title].filter(Boolean).join(' · ') };
}

interface TitlePage {
  page: 'show' | 'movie';
  id: string;
}

export function titlePage(play: PlayEntry): TitlePage | null {
  if (!play.inCatalog) {
    return null;
  }
  if (play.showId) {
    return { page: 'show', id: play.showId };
  }
  if (play.kind === 'movie' && play.itemId) {
    return { page: 'movie', id: play.itemId };
  }
  return null;
}

/** How long a play lasted: as measured, as the runtime of its title where the
 * other server kept no duration, or unknown where the catalog holds no runtime
 * either. */
export type WatchedTime = { kind: 'measured' | 'runtime'; ms: number } | { kind: 'unknown' };

export function watchedTime(play: PlayEntry): WatchedTime {
  if (!play.watchedIsRuntime) {
    return { kind: 'measured', ms: play.watchedMs };
  }
  if (play.watchedMs <= 0) {
    return { kind: 'unknown' };
  }
  return { kind: 'runtime', ms: play.watchedMs };
}
