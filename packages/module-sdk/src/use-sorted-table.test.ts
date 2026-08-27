// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type SortDirection,
  type SortedColumn,
  type SortedTable,
  type TableOrder,
  type TablePage,
  type TableQuery,
  useSortedTable,
} from './use-sorted-table';

interface Grab {
  id: string;
  title: string;
  progress: number;
  grabbedAt: number;
}

type Key = 'release' | 'progress' | 'added';

const COLUMNS: SortedColumn<Grab, Key>[] = [
  { sortKey: 'release', labelKey: 'col.release', valueField: 'title', ascendingFirst: true },
  { sortKey: 'progress', labelKey: 'col.progress', valueField: 'progress', wide: true },
  { id: 'speed', labelKey: 'col.speed', wide: true },
  { sortKey: 'added', labelKey: 'col.added', valueField: 'grabbedAt' },
  { id: 'actions' },
];

const NEWEST_FIRST: TableOrder<Key> = { sort: 'added', dir: 'desc' };

const PAGE: TablePage = { page: 3, perPage: 10, total: 42 };

const GRABS: Grab[] = [{ id: 'g1', title: 'Frieren', progress: 42, grabbedAt: 1_700_000 }];

const KEYS: Key[] = ['release', 'progress', 'added'];
const DIRECTIONS: SortDirection[] = ['asc', 'desc'];

interface GrabQuery extends TableQuery<Key> {
  q?: string;
}

function queue(query: GrabQuery = {}, rows?: Grab[]) {
  const asked: GrabQuery[] = [];
  const { result, rerender } = renderHook(
    (current: GrabQuery) =>
      useSortedTable({
        columns: COLUMNS,
        rows,
        page: PAGE,
        query: current,
        onQueryChange: (next) => asked.push(next),
        defaultOrder: NEWEST_FIRST,
        rowId: (row: Grab) => row.id,
      }),
    { initialProps: query },
  );
  return { asked, result, rerender };
}

const headingFor = (result: { current: SortedTable<Grab> }, id: string) =>
  result.current.headings.find((heading) => heading.id === id);

describe('useSortedTable', () => {
  it('carries every order to the wire and back unchanged', () => {
    const round = KEYS.flatMap((sort) =>
      DIRECTIONS.map((dir) => {
        const { asked, result } = queue({ sort, dir });
        result.current.table.getColumn(sort)?.toggleSorting(dir === 'desc');
        return [
          { sort, dir },
          { sort: asked[0]?.sort, dir: asked[0]?.dir },
        ];
      }),
    );

    for (const [sent, back] of round) expect(back).toEqual(sent);
    expect(round).toHaveLength(6);
  });

  it('orders by the default until the query names something', () => {
    const { result } = queue();

    expect(headingFor(result, 'added')?.sorted).toBe('desc');
    expect(headingFor(result, 'release')?.sorted).toBe(false);
  });

  it('reads the order off the query, so a heading cannot go stale', () => {
    const { result, rerender } = queue();

    rerender({ sort: 'release', dir: 'asc' });

    expect(headingFor(result, 'release')?.sorted).toBe('asc');
    expect(headingFor(result, 'added')?.sorted).toBe(false);
  });

  it('asks for the pressed column back on the first page, keeping the filters', () => {
    const { asked, result } = queue({ page: 4, q: 'frieren' });

    headingFor(result, 'release')?.onSortPress?.();

    expect(asked).toEqual([{ page: 1, q: 'frieren', sort: 'release', dir: 'asc' }]);
  });

  it('turns a column over when it is already the one ordering', () => {
    const { asked, result } = queue({ sort: 'progress', dir: 'desc' });

    headingFor(result, 'progress')?.onSortPress?.();

    expect(asked[0]?.dir).toBe('asc');
  });

  it('offers no press on a column that names no field', () => {
    const { result } = queue();

    expect(headingFor(result, 'speed')?.onSortPress).toBeUndefined();
    expect(headingFor(result, 'actions')?.onSortPress).toBeUndefined();
    expect(headingFor(result, 'release')?.onSortPress).toBeTypeOf('function');
  });

  it('lets every column that names a field actually sort', () => {
    const { result } = queue();

    const offered = result.current.table
      .getAllColumns()
      .filter((column) => column.getCanSort())
      .map((column) => column.id);

    expect(offered).toEqual(KEYS);
  });

  it('falls back to the default when the order names a column nobody declared', () => {
    const { asked, result } = queue();

    result.current.table.setSorting([{ id: 'nonesuch', desc: false }]);

    expect(asked[0]?.sort).toBe('added');
    expect(asked[0]?.dir).toBe('desc');
  });

  it('survives a table that has been given no page at all', () => {
    const asked: GrabQuery[] = [];
    const { result } = renderHook(() =>
      useSortedTable({
        columns: COLUMNS,
        query: {},
        onQueryChange: (next: GrabQuery) => asked.push(next),
        defaultOrder: NEWEST_FIRST,
      }),
    );

    expect(result.current.table.getPageCount()).toBe(0);
    expect(result.current.table.getState().pagination.pageIndex).toBe(0);
  });

  it('counts the pages the server reported rather than the rows in hand', () => {
    const { asked, result } = queue({ sort: 'release', dir: 'asc' });

    result.current.table.setPageIndex(0);

    expect(result.current.table.getPageCount()).toBe(5);
    expect(asked).toEqual([{ page: 1, sort: 'release', dir: 'asc' }]);
  });

  it('numbers the page it asks for from one, where the table counts from zero', () => {
    const { asked, result } = queue({ sort: 'release', dir: 'asc' });

    result.current.table.setPagination({ pageIndex: 1, pageSize: PAGE.perPage });

    expect(asked).toEqual([{ page: 2, sort: 'release', dir: 'asc' }]);
  });

  it('reads a cell off the field that made its column sortable', () => {
    const { result } = queue({}, GRABS);

    const row = result.current.table.getRowModel().rows[0];

    expect(row?.getValue('release')).toBe('Frieren');
    expect(row?.getValue('added')).toBe(1_700_000);
  });
});
