import { SpatialNavigator } from '@kroma/spatial-nav';
import { describe, expect, it } from 'vitest';

function strip(): SpatialNavigator {
  const nav = new SpatialNavigator();
  nav.registerNode('row', { orientation: 'horizontal' });
  return nav;
}

function tile(nav: SpatialNavigator, id: string, index?: number) {
  nav.registerNode(id, { parent: 'row', focusable: true, index });
}

/** The ids the row resolves to, left to right, from wherever focus opens. */
function order(nav: SpatialNavigator): string[] {
  nav.focus('row');
  const walked: string[] = [];
  while (nav.focusedId && !walked.includes(nav.focusedId)) {
    walked.push(nav.focusedId);
    nav.handle('right');
  }
  return walked;
}

describe('sibling order', () => {
  it('resolves siblings in registration order when no index is declared', () => {
    const nav = strip();

    tile(nav, 'a');
    tile(nav, 'b');
    tile(nav, 'c');

    expect(order(nav)).toEqual(['a', 'b', 'c']);
  });

  it('resolves siblings by declared index, whatever order they registered in', () => {
    const nav = strip();

    tile(nav, 'c', 2);
    tile(nav, 'a', 0);
    tile(nav, 'b', 1);

    expect(order(nav)).toEqual(['a', 'b', 'c']);
  });

  it('appends an index-less node after the highest index declared so far', () => {
    const nav = strip();

    tile(nav, 'a', 0);
    tile(nav, 'c', 5);
    tile(nav, 'd');

    expect(order(nav)).toEqual(['a', 'c', 'd']);
  });

  it('breaks a tie on the same index with registration order', () => {
    const nav = strip();

    tile(nav, 'a', 1);
    tile(nav, 'b', 1);

    expect(order(nav)).toEqual(['a', 'b']);
  });

  it('leaves a gap in the indices walkable', () => {
    const nav = strip();

    tile(nav, 'a', 0);
    tile(nav, 'z', 40);

    expect(order(nav)).toEqual(['a', 'z']);
  });

  it('puts a remounted head tile back at the head', () => {
    const nav = strip();
    tile(nav, 'a', 0);
    tile(nav, 'b', 1);
    tile(nav, 'c', 2);

    nav.unregisterNode('a');
    tile(nav, 'a', 0);

    expect(order(nav)).toEqual(['a', 'b', 'c']);
  });

  it('still walks left onto a tile that remounted last', () => {
    const nav = strip();
    tile(nav, 'a', 0);
    tile(nav, 'b', 1);
    tile(nav, 'c', 2);
    nav.unregisterNode('a');
    tile(nav, 'a', 0);

    nav.focus('b');
    nav.handle('left');

    expect(nav.focusedId).toBe('a');
  });

  it('keeps the order of the tiles a sliding window did not touch', () => {
    const nav = strip();
    for (const [index, id] of ['a', 'b', 'c', 'd'].entries()) tile(nav, id, index);

    nav.unregisterNode('a');
    nav.unregisterNode('b');
    tile(nav, 'e', 4);

    expect(order(nav)).toEqual(['c', 'd', 'e']);
  });
});
