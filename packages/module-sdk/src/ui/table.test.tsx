// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Table } from './table';

function head(children: ReactNode) {
  return render(
    <Table.Root columns="1fr 1fr" label="Downloads">
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

  it('turns the whole heading cell into one control when it can sort', () => {
    const onSortPress = vi.fn();

    head(
      <Table.Column sorted="desc" onSortPress={onSortPress}>
        Added
      </Table.Column>,
    );
    const control = screen.getByRole('button');
    control.click();

    const column = screen.getByRole('columnheader');
    expect(column.getAttribute('aria-sort')).toBe('descending');
    expect(control.getAttribute('aria-labelledby')).toBe(column.id);
    expect(onSortPress).toHaveBeenCalledOnce();
  });

  it('says it sorts nothing yet while another column is doing the ordering', () => {
    head(<Table.Column onSortPress={() => undefined}>Progress</Table.Column>);

    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('none');
  });
});
