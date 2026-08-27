// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '#ui/components/atoms/badge';
import { pinDesignWidth } from '#ui/core';
import { clearPressGuard } from '#ui/lib/press-guard';
import { type SortColumn, Table, type TableColumn } from './table';

afterEach(() => {
  cleanup();
  clearPressGuard();
  pinDesignWidth();
});

function Grid({ variant }: Readonly<{ variant?: 'framed' | 'plain' }>) {
  return (
    <Table.Root variant={variant} label="Modules">
      <Table.Header>
        <Table.Row>
          <Table.Cell>Module</Table.Cell>
          <Table.Cell>Port</Table.Cell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>tv.kroma.torrents</Table.Cell>
          <Table.Cell>41310</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>tv.kroma.whisper</Table.Cell>
          <Table.Cell>41311</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
}

const rules = () => screen.getAllByRole('row').map((row) => getComputedStyle(row).borderTopWidth);

describe('<Table>', () => {
  it('names the grid and draws the roles a reader navigates it by', () => {
    render(<Grid />);
    expect(screen.getByRole('table', { name: 'Modules' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });

  it('rules every seam between rows and nothing above the first', () => {
    render(<Grid />);
    expect(rules()).toEqual(['0px', '1px', '1px']);
  });

  it('rules a first row written without a section the same way', () => {
    render(
      <Table.Root>
        <Table.Row>
          <Table.Cell>Only</Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell>Next</Table.Cell>
        </Table.Row>
      </Table.Root>,
    );
    expect(rules()).toEqual(['0px', '1px']);
  });

  it('insets a framed cell from its frame and sits a plain one flush', () => {
    const { rerender } = render(<Grid />);
    expect(getComputedStyle(screen.getAllByRole('cell')[0] as HTMLElement).paddingLeft).toBe(
      '12px',
    );
    rerender(<Grid variant="plain" />);
    expect(getComputedStyle(screen.getAllByRole('cell')[0] as HTMLElement).paddingLeft).toBe('0px');
  });

  it('sets a string cell in the type of the section it sits in', () => {
    render(<Grid />);
    const head = getComputedStyle(screen.getByText('Port')).fontSize;
    const body = getComputedStyle(screen.getByText('41310')).fontSize;
    expect(head).not.toBe(body);
  });

  it('draws a composed cell exactly as it was written', () => {
    render(
      <Table.Root>
        <Table.Body>
          <Table.Row>
            <Table.Cell>
              <Badge tone="neutral">Active</Badge>
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>,
    );
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('drops anything that is not a part rather than letting it shift the grid', () => {
    render(
      <Table.Root>
        <Table.Body>
          {'  '}
          <Table.Row>
            <Table.Cell>Only</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>,
    );
    expect(rules()).toEqual(['0px']);
  });

  it('refuses a part written outside its Root, rather than drawing half a grid', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <Table.Row>
          <Table.Cell>Orphan</Table.Cell>
        </Table.Row>,
      ),
    ).toThrow(/Table.Root/);
    quiet.mockRestore();
  });
});

const headings = () => screen.getAllByRole('columnheader');

const heading = (at: number) => headings()[at] as HTMLElement;

const rank = (at: number) => within(heading(at)).queryByText(/^\d+$/)?.textContent ?? null;

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));

const SORTABLE: readonly TableColumn[] = [{ column: 'id' }, { column: 'port' }, {}];

function Sortable({
  multiple = false,
  onSortChange,
}: Readonly<{ multiple?: boolean; onSortChange?: (next: readonly SortColumn[]) => void }>) {
  const [sort, setSort] = useState<readonly SortColumn[]>([]);
  return (
    <Table.Root
      label="Modules"
      columns={SORTABLE}
      multiple={multiple}
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        onSortChange?.(next);
      }}
    >
      <Table.Header>
        <Table.Row>
          <Table.Cell>Module</Table.Cell>
          <Table.Cell>Port</Table.Cell>
          <Table.Cell>State</Table.Cell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>tv.kroma.torrents</Table.Cell>
          <Table.Cell>41310</Table.Cell>
          <Table.Cell>Running</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
}

describe('a heading that sorts', () => {
  it('cycles ascending, then descending, then out of the sort', () => {
    render(<Sortable />);

    const cycle = [0, 1, 2].map(() => {
      press('Module');
      return heading(0).getAttribute('aria-sort');
    });

    expect(cycle).toEqual(['ascending', 'descending', 'none']);
  });

  it('hands the caller the whole next sort rather than one direction', () => {
    const reported = vi.fn();
    render(<Sortable onSortChange={reported} />);

    press('Port');

    expect(reported).toHaveBeenCalledWith([{ column: 'port', direction: 'asc' }]);
  });

  it('is one control carrying its own direction, not a name beside a second target', () => {
    render(<Sortable />);

    const module = heading(0);

    expect(within(module).getAllByRole('button')).toHaveLength(1);
    expect(within(module).getByRole('button').querySelector('svg')).toBeTruthy();
  });

  it('presses over the whole cell, whose padding it takes', () => {
    render(<Sortable />);

    const module = heading(0);

    expect(getComputedStyle(module).paddingLeft).toBe('0px');
    expect(getComputedStyle(within(module).getByRole('button')).paddingLeft).toBe('12px');
  });

  it('leaves a heading whose column names no key out of the sort and out of the tab order', () => {
    render(<Sortable />);

    const state = heading(2);

    expect(within(state).queryByRole('button')).toBeNull();
    expect(state.getAttribute('aria-sort')).toBeNull();
  });

  it('drops the columns already sorted, unless the table takes several', () => {
    render(<Sortable />);
    press('Module');

    press('Port');

    expect(headings().map((head) => head.getAttribute('aria-sort'))).toEqual([
      'none',
      'ascending',
      null,
    ]);
  });

  it('ranks a column behind the ones already sorting when the table takes several', () => {
    render(<Sortable multiple />);
    press('Module');

    press('Port');

    expect(headings().map((head) => head.getAttribute('aria-sort'))).toEqual([
      'ascending',
      'ascending',
      null,
    ]);
    expect([rank(0), rank(1)]).toEqual(['1', '2']);
  });

  it('turns a stacked column where it stands, keeping the rank it was given', () => {
    render(<Sortable multiple />);
    press('Module');
    press('Port');

    press('Module');

    expect(headings().map((head) => head.getAttribute('aria-sort'))).toEqual([
      'descending',
      'ascending',
      null,
    ]);
    expect([rank(0), rank(1)]).toEqual(['1', '2']);
  });

  it('draws no rank while one column carries the whole sort', () => {
    render(<Sortable multiple />);

    press('Module');

    expect(rank(0)).toBeNull();
  });

  it('draws a sort the caller only reports, without offering a control', () => {
    render(
      <Table.Root
        label="Modules"
        columns={[{ column: 'port' }]}
        sort={[{ column: 'port', direction: 'desc' }]}
      >
        <Table.Header>
          <Table.Row>
            <Table.Cell>Port</Table.Cell>
          </Table.Row>
        </Table.Header>
      </Table.Root>,
    );

    const port = heading(0);

    expect(port.getAttribute('aria-sort')).toBe('descending');
    expect(within(port).queryByRole('button')).toBeNull();
  });
});

const COLUMNS: readonly TableColumn[] = [
  { flex: 2, min: 160 },
  { width: 148 },
  { width: 128, from: 'md' },
  { align: 'end' },
];

function Declared() {
  return (
    <Table.Root label="Downloads" columns={COLUMNS}>
      <Table.Header>
        <Table.Row>
          <Table.Cell>Title</Table.Cell>
          <Table.Cell>State</Table.Cell>
          <Table.Cell>Added</Table.Cell>
          <Table.Cell>Size</Table.Cell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell>Dune</Table.Cell>
          <Table.Cell>Seeding</Table.Cell>
          <Table.Cell>2026-08-24</Table.Cell>
          <Table.Cell>31.2 GB</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
}

const boxOf = (node: Element) => {
  const style = getComputedStyle(node as HTMLElement);
  return { width: style.width, grow: style.flexGrow, min: style.minWidth };
};

describe('a declared column', () => {
  it('gives the same box to the nth cell of every row', () => {
    pinDesignWidth(1200);
    render(<Declared />);

    const state = [heading(1), screen.getByText('Seeding').closest('[role="cell"]') as Element];

    expect(state.map(boxOf)).toEqual([
      { width: '148px', grow: '0', min: '0px' },
      { width: '148px', grow: '0', min: '0px' },
    ]);
  });

  it('shares what the fixed columns leave in the proportion each asks for', () => {
    pinDesignWidth(1200);
    render(<Declared />);

    expect(boxOf(heading(0))).toEqual({ width: 'auto', grow: '2', min: '160px' });
  });

  it('drops a column below the breakpoint it names rather than narrowing it', () => {
    pinDesignWidth(480);
    render(<Declared />);

    expect(headings().map((head) => head.textContent)).toEqual(['Title', 'State', 'Size']);
  });

  it('sits a column at the end when it asks for one', () => {
    pinDesignWidth(1200);
    render(<Declared />);

    expect(getComputedStyle(heading(3)).alignItems).toBe('flex-end');
  });

  it('keeps every cell equal when the table declares no columns', () => {
    render(<Grid />);

    expect(headings().map(boxOf)).toEqual([
      { width: 'auto', grow: '1', min: '0px' },
      { width: 'auto', grow: '1', min: '0px' },
    ]);
  });
});

let mounts = 0;

function Beat() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return null;
}

const beating = (names: readonly string[]) => (
  <Table.Root label="Modules">
    <Table.Body>
      {names.map((name) => (
        <Table.Row key={name}>
          <Table.Cell>
            <Beat />
          </Table.Cell>
        </Table.Row>
      ))}
    </Table.Body>
  </Table.Root>
);

describe('a row the caller reorders', () => {
  it('keeps its identity rather than being remounted under its old position', () => {
    mounts = 0;
    const { rerender } = render(beating(['a', 'b']));

    rerender(beating(['b', 'a']));

    expect(mounts).toBe(2);
  });
});

const grid = () => screen.getByRole('table') as HTMLElement;

const scroller = () => grid().parentElement?.parentElement as HTMLElement;

describe('a table wider than the room it is given', () => {
  it('scrolls sideways rather than clipping, and will not shrink past its columns', () => {
    pinDesignWidth(1200);
    render(<Declared />);

    expect(getComputedStyle(scroller()).overflowX).toBe('auto');
    expect(getComputedStyle(grid()).minWidth).toBe('436px');
  });

  it('leaves a dropped column out of the width it refuses to shrink past', () => {
    pinDesignWidth(480);
    render(<Declared />);

    expect(getComputedStyle(grid()).minWidth).toBe('308px');
  });

  it('keeps the rows directly under the table, with the scroller outside it', () => {
    pinDesignWidth(1200);
    render(<Declared />);

    expect(grid().firstElementChild?.getAttribute('role')).toBe('rowgroup');
    expect(scroller().getAttribute('role')).toBeNull();
  });

  it('is not wrapped in a scroller at all when nothing can overflow', () => {
    render(<Grid />);

    expect(getComputedStyle(scroller()).overflowX).not.toBe('auto');
  });
});

describe('a sorting heading in a column that reads from the end', () => {
  it('keeps the whole cell as the control and moves its face instead', () => {
    render(
      <Table.Root
        label="Modules"
        columns={[{ column: 'port', align: 'end' }, { align: 'end' }]}
        sort={[]}
        onSortChange={() => undefined}
      >
        <Table.Header>
          <Table.Row>
            <Table.Cell>Port</Table.Cell>
            <Table.Cell>State</Table.Cell>
          </Table.Row>
        </Table.Header>
      </Table.Root>,
    );

    const control = within(heading(0)).getByRole('button');

    expect(getComputedStyle(heading(0)).alignItems).not.toBe('flex-end');
    expect(getComputedStyle(control).justifyContent).toBe('flex-end');
    expect(getComputedStyle(heading(1)).alignItems).toBe('flex-end');
  });
});
