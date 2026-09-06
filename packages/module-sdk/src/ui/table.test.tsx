// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type SortColumn, Table } from './table';

function head(children: ReactNode, sorting?: Partial<Parameters<typeof Table.Root>[0]>) {
  return render(
    <Table.Root
      columns={[{ column: 'release' }, { column: 'added' }]}
      label="Downloads"
      {...sorting}
    >
      <Table.Header>{children}</Table.Header>
    </Table.Root>,
  );
}

describe('Table.Column', () => {
  it('names its column to assistive tech without becoming a control', () => {
    head(<Table.Column>Release</Table.Column>);

    expect(screen.getByRole('columnheader').textContent).toBe('Release');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('turns the heading into the sort control once the table sorts', () => {
    const onSortChange = vi.fn();
    const sort: SortColumn[] = [{ column: 'added', direction: 'desc' }];

    head(
      [
        <Table.Column key="release">Release</Table.Column>,
        <Table.Column key="added">Added</Table.Column>,
      ],
      { sort, onSortChange },
    );
    const [, added] = screen.getAllByRole('columnheader');
    expect(added?.getAttribute('aria-sort')).toBe('descending');

    fireEvent.click(screen.getAllByRole('button')[1] as HTMLElement);

    expect(onSortChange).toHaveBeenCalledOnce();
    expect(onSortChange.mock.calls[0]?.[1]).toEqual({ column: 'added' });
  });
});

describe('Table.Row', () => {
  it('presses as one control and keeps its cells', () => {
    const onPress = vi.fn();
    render(
      <Table.Root columns={[{}, { width: 80 }]} label="Downloads">
        <Table.Row onPress={onPress}>
          <Table.Cell>Alpha</Table.Cell>
          <Table.Cell>Beta</Table.Cell>
        </Table.Row>
      </Table.Root>,
    );

    const row = screen.getByRole('row');
    expect(row.textContent).toBe('AlphaBeta');
    fireEvent.click(row);

    expect(onPress).toHaveBeenCalledOnce();
  });
});
