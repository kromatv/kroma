import { type SortedTable, useSortedTable } from '@kroma/module-sdk';
import type { SortColumn } from '@kroma/ui/kit';
import { useCallback, useMemo } from 'react';
import { DOWNLOAD_COLUMNS } from './download-columns';
import type { DownloadQuery, DownloadView, PageView } from './schemas';

const NEWEST_FIRST = { sort: 'added', dir: 'desc' } as const;

interface DownloadsTableOptions {
  downloads?: DownloadView[];
  page?: PageView;
  query: DownloadQuery;
  onQueryChange: (next: DownloadQuery) => void;
}

export interface DownloadsTable extends SortedTable<DownloadView> {
  sort: readonly SortColumn[];
  onSortChange: (next: readonly SortColumn[], details: { column: string }) => void;
}

export function useDownloadsTable({
  downloads,
  page,
  query,
  onQueryChange,
}: Readonly<DownloadsTableOptions>): DownloadsTable {
  const { table, headings } = useSortedTable({
    columns: DOWNLOAD_COLUMNS,
    rows: downloads,
    page,
    query,
    onQueryChange,
    defaultOrder: NEWEST_FIRST,
    rowId: (row) => row.id,
  });

  const sort = useMemo(
    () =>
      headings.flatMap((heading) =>
        heading.sorted ? [{ column: heading.id, direction: heading.sorted }] : [],
      ),
    [headings],
  );

  const pressColumn = useCallback(
    (column: string) => headings.find((heading) => heading.id === column)?.onSortPress?.(),
    [headings],
  );
  const onSortChange = useCallback(
    (_next: readonly SortColumn[], details: { column: string }) => pressColumn(details.column),
    [pressColumn],
  );

  return { table, headings, sort, onSortChange };
}
