// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { layout } from '#ui/testing';
import { cellWidth, columnsFor, Grid } from './grid';

describe('columnsFor', () => {
  it('fits as many cells as the room allows', () => {
    expect(columnsFor(1000, 260, 24)).toBe(3);
    expect(columnsFor(1920, 260, 24)).toBe(6);
  });

  it('counts the gaps between cells, not after the last one', () => {
    expect(columnsFor(284, 260, 24)).toBe(1);
    expect(columnsFor(544, 260, 24)).toBe(2);
  });

  it('keeps one column when the room is narrower than a single cell', () => {
    expect(columnsFor(200, 260, 24)).toBe(1);
    expect(columnsFor(0, 260, 24)).toBe(1);
  });

  it('never divides by a cell of no width', () => {
    expect(columnsFor(1000, 0, 24)).toBe(1);
  });
});

describe('an auto-filled cell', () => {
  it('never produces a cell narrower than the minimum asked for', () => {
    const gap = 24;
    for (const min of [160, 220, 260, 320]) {
      for (let room = min; room <= 2400; room += 37) {
        const cell = cellWidth(room, columnsFor(room, min, gap), gap);
        expect(cell).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('never overflows the room it was given', () => {
    const gap = 24;
    for (let room = 300; room <= 2400; room += 41) {
      const columns = columnsFor(room, 260, gap);
      const used = cellWidth(room, columns, gap) * columns + gap * (columns - 1);
      expect(used).toBeLessThanOrEqual(room);
    }
  });
});

describe('a grid that was handed no width', () => {
  const tiles = Array.from({ length: 7 }, (_, index) => `tile ${index + 1}`).map((title) => (
    <Text key={title}>{title}</Text>
  ));

  it('paints nothing until it has measured its own box', () => {
    const { container } = render(<Grid min={260}>{tiles}</Grid>);
    expect(screen.queryByText('tile 1')).toBeNull();

    layout(container.firstElementChild as HTMLElement, { width: 1000 });
    expect(screen.getByText('tile 1')).toBeTruthy();
    expect(getComputedStyle(screen.getByText('tile 1').parentElement as HTMLElement).width).toBe(
      `${cellWidth(1000, 3, 24)}px`,
    );
  });

  it('re-measures into a new column count when the room changes', () => {
    const { container } = render(<Grid min={260}>{tiles}</Grid>);
    const box = container.firstElementChild as HTMLElement;
    const rows = () => (box.firstElementChild as HTMLElement).children;

    layout(box, { width: 1000 });
    expect(rows()).toHaveLength(3);

    layout(box, { width: 560 });
    expect(rows()).toHaveLength(4);
  });
});

beforeAll(() => configureRemote());

const TILES = ['Un', 'Deux', 'Trois', 'Quatre'];

function twoByTwo(): HTMLElement {
  const { container } = render(
    <FocusScope>
      <Grid columns={2} width={800}>
        {TILES.map((label) => (
          <Focusable key={label} label={label} autoFocus={label === 'Un'} />
        ))}
      </Grid>
    </FocusScope>,
  );
  return container.firstElementChild as HTMLElement;
}

function stackFrom(label: string, box: HTMLElement): string[] {
  const layers: string[] = [];
  for (let node = screen.getByLabelText(label); node !== box; ) {
    layers.push(node.style.zIndex);
    node = node.parentElement as HTMLElement;
  }
  return layers;
}

describe('a focused tile', () => {
  it('rises at every level between itself and the grid', () => {
    const box = twoByTwo();

    expect(stackFrom('Un', box)).toEqual(['1', '1', '1', '1', '1']);
  });

  it('leaves the tiles it paints over on the ground', () => {
    const box = twoByTwo();

    expect(stackFrom('Deux', box)).toEqual(['0', '0', '1', '1', '1']);
    expect(stackFrom('Trois', box)).toEqual(['0', '0', '0', '0', '1']);
  });
});
