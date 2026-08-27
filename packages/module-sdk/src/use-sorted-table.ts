// The headings carry the direction read off the QUERY rather than off
// `column.getIsSorted()`. A table instance keeps one identity for its whole
// life, so a heading read through it is a heading the React Compiler caches at
// mount and never recomputes, which is a frozen sort indicator on screen.

import {
  type ColumnDef,
  functionalUpdate,
  getCoreRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  type Table as TableInstance,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface TableOrder<Key extends string = string> {
  sort: Key;
  dir: SortDirection;
}

export interface TableQuery<Key extends string = string> {
  page?: number;
  sort?: Key;
  dir?: SortDirection;
}

export interface TablePage {
  page: number;
  perPage: number;
  total: number;
}

export interface SortableColumn<Row, Key extends string = string> {
  sortKey: Key;
  labelKey?: string;
  valueField: keyof Row & string;
  ascendingFirst?: boolean;
  wide?: boolean;
}

export interface PlainColumn {
  id: string;
  labelKey?: string;
  valueField?: undefined;
  wide?: boolean;
}

export type SortedColumn<Row, Key extends string = string> = SortableColumn<Row, Key> | PlainColumn;

export interface TableHeading {
  id: string;
  labelKey?: string;
  wide?: boolean;
  sorted: SortDirection | false;
  onSortPress?: () => void;
}

export interface SortedTableOptions<Row, Key extends string, Query extends TableQuery<Key>> {
  columns: readonly SortedColumn<Row, Key>[];
  rows?: Row[];
  page?: TablePage;
  query: Query;
  onQueryChange: (next: Query) => void;
  defaultOrder: TableOrder<Key>;
  rowId?: (row: Row) => string;
}

export interface SortedTable<Row> {
  table: TableInstance<Row>;
  headings: TableHeading[];
}

const NO_ROWS: never[] = [];

function orderIn<Key extends string>(
  query: TableQuery<Key>,
  fallback: TableOrder<Key>,
): TableOrder<Key> {
  return { sort: query.sort ?? fallback.sort, dir: query.dir ?? fallback.dir };
}

function sortingOf(order: TableOrder): SortingState {
  return [{ id: order.sort, desc: order.dir === 'desc' }];
}

function sortable<Row, Key extends string>(
  column: SortedColumn<Row, Key>,
): column is SortableColumn<Row, Key> {
  return column.valueField !== undefined;
}

function idOf<Row, Key extends string>(column: SortedColumn<Row, Key>): string {
  return sortable(column) ? column.sortKey : column.id;
}

function orderOf<Row, Key extends string>(
  sorting: SortingState,
  columns: readonly SortedColumn<Row, Key>[],
  fallback: TableOrder<Key>,
): TableOrder<Key> {
  const first = sorting[0];
  const known = columns.filter(sortable).find((column) => column.sortKey === first?.id);
  if (!first || !known) return fallback;
  return { sort: known.sortKey, dir: first.desc ? 'desc' : 'asc' };
}

function definitionsOf<Row, Key extends string>(
  columns: readonly SortedColumn<Row, Key>[],
): ColumnDef<Row>[] {
  return columns.map((column) => {
    if (!sortable(column)) return { id: column.id, enableSorting: false };
    const field = column.valueField;
    return {
      id: column.sortKey,
      accessorFn: (row: Row) => row[field],
      sortDescFirst: column.ascendingFirst !== true,
    };
  });
}

/**
 * A table ordered and paged by the server. The query stays authoritative, and a
 * new order asks for page 1 because page 4 of a different order is a different
 * list.
 */
export function useSortedTable<Row, Key extends string, Query extends TableQuery<Key>>({
  columns,
  rows = NO_ROWS,
  page,
  query,
  onQueryChange,
  defaultOrder,
  rowId,
}: Readonly<SortedTableOptions<Row, Key, Query>>): SortedTable<Row> {
  const order = useMemo(() => orderIn(query, defaultOrder), [query, defaultOrder]);
  const sorting = useMemo(() => sortingOf(order), [order]);
  const pagination = useMemo(() => {
    const size = page?.perPage ?? 0;
    return { pageIndex: (page?.page ?? 1) - 1, pageSize: size > 0 ? size : 1 };
  }, [page?.page, page?.perPage]);
  const definitions = useMemo(() => definitionsOf(columns), [columns]);

  const onSortingChange: OnChangeFn<SortingState> = useCallback(
    (updater) => {
      const asked = orderOf(functionalUpdate(updater, sortingOf(order)), columns, defaultOrder);
      onQueryChange({ ...query, sort: asked.sort, dir: asked.dir, page: 1 });
    },
    [order, columns, defaultOrder, query, onQueryChange],
  );

  const onPaginationChange: OnChangeFn<PaginationState> = useCallback(
    (updater) => {
      onQueryChange({ ...query, page: functionalUpdate(updater, pagination).pageIndex + 1 });
    },
    [pagination, query, onQueryChange],
  );

  const table = useReactTable({
    data: rows,
    columns: definitions,
    getRowId: rowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: false,
    rowCount: page?.total ?? 0,
    state: { sorting, pagination },
    onSortingChange,
    onPaginationChange,
  });

  const headings = useMemo(
    () =>
      columns.map((column) => {
        const id = idOf(column);
        return {
          id,
          labelKey: column.labelKey,
          wide: column.wide,
          sorted: order.sort === id ? order.dir : (false as const),
          onSortPress: column.valueField ? () => table.getColumn(id)?.toggleSorting() : undefined,
        };
      }),
    [columns, order, table],
  );

  return { table, headings };
}
