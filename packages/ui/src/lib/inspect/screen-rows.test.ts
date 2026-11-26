import { describe, expect, it } from 'vitest';
import { MAX_SCREEN_ROWS, screenRows } from './screen-rows';
import type { KitNode } from './screen-tree';

function node(name: string, children: KitNode[] = []): KitNode {
  return { name, props: { open: true }, box: { x: 0, y: 0, width: 10, height: 10 }, children };
}

describe('a screen as flat rows', () => {
  it('lists a parent before its children, each one level deeper', () => {
    const tree = {
      fibers: 9,
      nodes: [node('Dialog.Root', [node('Dialog.Panel', [node('Text')]), node('Dialog.Footer')])],
    };

    const { rows, fibers, truncated } = screenRows(tree);

    expect(rows.map((row) => `${row.depth}:${row.name}`)).toEqual([
      '0:Dialog.Root',
      '1:Dialog.Panel',
      '2:Text',
      '1:Dialog.Footer',
    ]);
    expect(fibers).toBe(9);
    expect(truncated).toBe(false);
  });

  it('keeps the props and the box of every row and drops the children', () => {
    const { rows } = screenRows({ fibers: 1, nodes: [node('Text')] });

    expect(rows).toEqual([
      { depth: 0, name: 'Text', props: { open: true }, box: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
  });

  it('stops at the row limit and says it was cut', () => {
    const nodes = Array.from({ length: MAX_SCREEN_ROWS + 5 }, () => node('Box'));

    const { rows, truncated } = screenRows({ fibers: nodes.length, nodes });

    expect(rows).toHaveLength(MAX_SCREEN_ROWS);
    expect(truncated).toBe(true);
  });

  it('reads an empty screen as no rows', () => {
    expect(screenRows({ fibers: 0, nodes: [] })).toEqual({ fibers: 0, truncated: false, rows: [] });
  });

  it('says which row holds the focus and leaves the key off every other', () => {
    const tree = { fibers: 2, nodes: [node('Card', [{ ...node('Button'), focused: true }])] };

    const { rows } = screenRows(tree);

    expect(rows.map((row) => row.focused)).toEqual([undefined, true]);
    expect(rows[0]).not.toHaveProperty('focused');
  });

  it('keeps the control of a row that runs one', () => {
    const control = { ref: 'c1', kind: 'switch', state: { checked: true }, actions: ['toggle'] };

    const { rows } = screenRows({
      fibers: 2,
      nodes: [node('Card', [{ ...node('Switch'), control }])],
    });

    expect(rows.map((row) => row.control)).toEqual([undefined, control]);
    expect(rows[0]).not.toHaveProperty('control');
  });

  it('keeps what the box of a text cuts off it', () => {
    const clipped = { width: 68, height: 0 };

    const { rows } = screenRows({
      fibers: 2,
      nodes: [node('Card', [{ ...node('Text'), clipped }])],
    });

    expect(rows.map((row) => row.clipped)).toEqual([undefined, clipped]);
    expect(rows[0]).not.toHaveProperty('clipped');
  });
});
