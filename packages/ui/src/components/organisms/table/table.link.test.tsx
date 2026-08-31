// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { Table } from './table';

afterEach(cleanup);

function Anchor({ to, ...host }: Readonly<Record<string, unknown>>) {
  return <View {...(host as object)} {...({ href: to } as object)} />;
}

function Log() {
  return (
    <Table.Root label="History">
      <Table.Header>
        <Table.Row>
          <Table.Cell>Title</Table.Cell>
          <Table.Cell>User</Table.Cell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row asChild>
          <Anchor to="/shows/severance">
            <Table.Cell>Severance</Table.Cell>
            <Table.Cell>maxime</Table.Cell>
          </Anchor>
        </Table.Row>
        <Table.Row>
          <Table.Cell>The Office</Table.Cell>
          <Table.Cell>maxime</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
}

const rows = () => screen.getAllByRole('row') as HTMLElement[];

const row = (at: number) => rows()[at] as HTMLElement;

describe('a table row that goes somewhere', () => {
  it('renders the row itself as the anchor carrying the route', () => {
    render(<Log />);

    expect(row(1).tagName).toBe('A');
    expect(row(1).getAttribute('href')).toBe('/shows/severance');
  });

  it('is still the row of its grid, holding the cells it was written with', () => {
    render(<Log />);

    const cells = within(row(1)).getAllByRole('cell');

    expect(cells.map((cell) => cell.textContent)).toEqual(['Severance', 'maxime']);
  });

  it('rules the seam above it as any other row does', () => {
    render(<Log />);

    expect(rows().map((one) => getComputedStyle(one).borderTopWidth)).toEqual([
      '0px',
      '1px',
      '1px',
    ]);
  });

  it('washes on hover, as a row that goes somewhere should', () => {
    render(<Log />);
    const resting = getComputedStyle(row(1)).backgroundColor;

    fireEvent.pointerEnter(row(1));

    expect(getComputedStyle(row(1)).backgroundColor).not.toBe(resting);
  });

  it('leaves a row written with no destination the plain row it was', () => {
    render(<Log />);

    expect(row(2).tagName).not.toBe('A');
  });
});
