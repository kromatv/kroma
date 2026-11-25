import { describe, expect, it } from 'vitest';
import { MAX_SCREEN_BYTES, screenRows } from './screen-rows';
import type { KitNode } from './screen-tree';

function text(children: string): KitNode {
  return { name: 'Text', props: { children }, box: null, children: [] };
}

function chain(depth: number): KitNode {
  let top = text('fond');
  for (let level = 0; level < depth; level += 1) {
    top = { name: 'Box', props: {}, box: null, children: [top] };
  }
  return top;
}

const utf8 = (json: string) => new TextEncoder().encode(json).length;

describe('a screen as flat rows under Metro resolution', () => {
  it('flattens a tree deeper than a call stack would take', () => {
    const { rows } = screenRows({ fibers: 1, nodes: [chain(50_000)] });

    expect(rows.at(-1)).toEqual({ depth: 1999, name: 'Box', props: {}, box: null });
  });

  it('stops at the last row the byte budget holds, counting UTF-8', () => {
    const wide = Array.from({ length: 1500 }, () => text('é€😀'.repeat(150)));

    const { rows, truncated } = screenRows({ fibers: wide.length, nodes: wide });

    const each = utf8(JSON.stringify(rows[0])) + 1;
    expect(truncated).toBe(true);
    expect(rows).toHaveLength(Math.floor(MAX_SCREEN_BYTES / each));
    expect(utf8(JSON.stringify(rows))).toBeLessThanOrEqual(MAX_SCREEN_BYTES);
  });
});
