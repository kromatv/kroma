// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '#ui/components/atoms/badge';
import { Table } from './table';

afterEach(cleanup);

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
