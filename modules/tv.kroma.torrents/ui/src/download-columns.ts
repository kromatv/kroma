import type { SortedColumn } from '@kroma/module-sdk';
import type { TableColumn } from '@kroma/ui/kit';
import type { DownloadSort, DownloadView } from './schemas';

const TITLE_MIN = 160;

type DownloadColumn = SortedColumn<DownloadView, DownloadSort> & { box: TableColumn };

// Live throughput is polled from the engine per request and never stored, so
// there is nothing for the server to ORDER BY.
export const DOWNLOAD_COLUMNS: readonly DownloadColumn[] = [
  {
    sortKey: 'release',
    labelKey: 'downloads.colRelease',
    valueField: 'title',
    ascendingFirst: true,
    box: { flex: 1, min: TITLE_MIN },
  },
  {
    sortKey: 'progress',
    labelKey: 'downloads.colProgress',
    valueField: 'progress',
    box: { width: 200, from: 'md' },
  },
  { id: 'speed', labelKey: 'downloads.colSpeed', box: { width: 132, from: 'md' } },
  {
    sortKey: 'status',
    labelKey: 'downloads.colStatus',
    valueField: 'status',
    ascendingFirst: true,
    box: { width: 128, from: 'md' },
  },
  {
    sortKey: 'added',
    labelKey: 'downloads.colAdded',
    valueField: 'grabbedAt',
    box: { width: 112, from: 'md' },
  },
  { id: 'actions', box: { width: 64 } },
];

export const DOWNLOAD_BOXES: readonly TableColumn[] = DOWNLOAD_COLUMNS.map((column) =>
  column.valueField ? { column: column.sortKey, ...column.box } : column.box,
);
