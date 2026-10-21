import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { type SortedColumn, type TableOrder, useSortedTable } from './use-sorted-table';

interface Grab {
  id: string;
  title: string;
}

type Key = 'release';

const COLUMNS: SortedColumn<Grab, Key>[] = [{ sortKey: 'release', valueField: 'title' }];
const ORDER: TableOrder<Key> = { sort: 'release', dir: 'asc' };
const QUERY = {};
const ignore = () => {};

function Downloads({ rows, total }: Readonly<{ rows: Grab[]; total: number }>) {
  const { table } = useSortedTable({
    columns: COLUMNS,
    rows,
    page: { page: 1, perPage: 2, total },
    query: QUERY,
    onQueryChange: ignore,
    defaultOrder: ORDER,
    rowId: (grab) => grab.id,
  });
  return (
    <>
      <p data-testid="titles">
        {table
          .getRowModel()
          .rows.map((row) => row.original.title)
          .join(',')}
      </p>
      <p data-testid="pages">{table.getPageCount()}</p>
    </>
  );
}

it('shows the rows and the page count of the latest render once the React Compiler memoizes the page', () => {
  const { rerender } = render(<Downloads rows={[{ id: '1', title: 'Dune' }]} total={1} />);

  rerender(
    <Downloads
      rows={[
        { id: '2', title: 'Alien' },
        { id: '3', title: 'Heat' },
      ]}
      total={6}
    />,
  );

  expect(screen.getByTestId('titles').textContent).toBe('Alien,Heat');
  expect(screen.getByTestId('pages').textContent).toBe('3');
});
