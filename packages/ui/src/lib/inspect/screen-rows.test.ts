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
});
