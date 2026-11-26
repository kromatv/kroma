// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { layout, measuring } from '#ui/testing';
import { createStyleTestHost } from '#ui/testing-style';
import { Table, type TableColumn } from './table.component';

const styleHost = createStyleTestHost();

afterEach(() => {
  cleanup();
  styleHost.pinDesignWidth();
});

const CELLS = '[role="cell"], [role="columnheader"]';

function show(columns: readonly TableColumn[], headings: readonly string[]) {
  styleHost.pinDesignWidth(1200);
  styleHost.render(
    <Table.Root label="Episodes" columns={columns}>
      <Table.Header>
        <Table.Row>
          {headings.map((heading) => (
            <Table.Cell key={heading}>{heading}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {['S01E01', 'S01E02'].map((episode) => (
          <Table.Row key={episode}>
            <Table.Cell>On</Table.Cell>
            <Table.Cell>{episode}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>,
  );
}

function measure(widths: readonly number[]) {
  for (const [at, heading] of screen.getAllByRole('columnheader').entries()) {
    layout(measuring(heading), { width: widths[at] ?? 0 });
  }
}

const second = () =>
  screen.getAllByRole('row').map((row) => getComputedStyle(row.querySelectorAll(CELLS)[1] ?? row));

describe('a column under a heading written as a string', () => {
  it('widens on every row when its heading needs more than its fixed width', () => {
    show([{}, { width: 60 }], ['Followed', 'Followed episode']);

    measure([64, 128]);

    expect(second().map((cell) => cell.width)).toEqual(['129px', '129px', '129px']);
  });

  it('keeps its fixed width when its heading fits', () => {
    show([{}, { width: 60 }], ['Followed', 'Code']);

    measure([64, 32]);

    expect(second().map((cell) => cell.width)).toEqual(['60px', '60px', '60px']);
  });

  it('stops shrinking at its heading rather than at a smaller min', () => {
    show([{ width: 120 }, { flex: 1, min: 40 }], ['Followed', 'Episode name']);

    measure([64, 96]);

    expect(second().map((cell) => cell.minWidth)).toEqual(['97px', '97px', '97px']);
  });

  it('counts its heading in the width the table scrolls sideways below', () => {
    show([{ width: 40 }, { width: 60 }], ['Followed', 'Followed episode']);

    measure([64, 128]);

    expect(getComputedStyle(screen.getByRole('table')).minWidth).toBe('194px');
  });
});
