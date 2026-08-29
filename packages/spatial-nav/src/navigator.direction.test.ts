import { SpatialNavigator } from '@kroma/spatial-nav';
import { describe, expect, it } from 'vitest';
import { board, row } from './tree.fixture';

const ROWS = [
  ['a0', 'a1', 'a2'],
  ['b0', 'b1', 'b2'],
  ['c0', 'c1', 'c2'],
];

const HEADED_GRID = [['head'], ['g0', 'g1', 'g2']];

describe('within a row', () => {
  it('walks right along the row', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a0');

    nav.handle('right');

    expect(nav.focusedId).toBe('a1');
  });

  it('walks left back along the row', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a2');

    nav.handle('left');

    expect(nav.focusedId).toBe('a1');
  });

  it('refuses to move past the end of the row', () => {
    const { nav } = row(['a0', 'a1']);
    nav.focus('a1');

    expect(nav.handle('right')).toBe(false);
    expect(nav.focusedId).toBe('a1');
  });

  it('refuses to move before the start of the row', () => {
    const { nav } = row(['a0', 'a1']);
    nav.focus('a0');

    expect(nav.handle('left')).toBe(false);
    expect(nav.focusedId).toBe('a0');
  });

  it('fires no callback for a direction it refuses', () => {
    const strip = row(['a0']);
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.handle('right');

    expect(strip.events).toEqual([]);
  });

  it('refuses a direction the row has no axis for', () => {
    const { nav } = row(['a0', 'a1']);
    nav.focus('a0');

    expect(nav.handle('down')).toBe(false);
  });
});

describe('between rows', () => {
  it('walks down onto the next row', () => {
    const { nav } = board(ROWS);
    nav.focus('a0');

    nav.handle('down');

    expect(nav.focusedId).toBe('b0');
  });

  it('walks up onto the row above', () => {
    const { nav } = board(ROWS);
    nav.focus('b0');

    nav.handle('up');

    expect(nav.focusedId).toBe('a0');
  });

  it('lands on the tile the row was last left on', () => {
    const { nav } = board(ROWS);
    nav.focus('b0');
    nav.handle('right');
    nav.handle('right');

    nav.handle('up');
    nav.handle('down');

    expect(nav.focusedId).toBe('b2');
  });

  it('lands on the first tile of a row nothing has focused yet', () => {
    const { nav } = board(ROWS);
    nav.focus('a0');
    nav.handle('right');

    nav.handle('down');

    expect(nav.focusedId).toBe('b0');
  });

  it('refuses to move above the first row', () => {
    const { nav } = board(ROWS);
    nav.focus('a1');

    expect(nav.handle('up')).toBe(false);
    expect(nav.focusedId).toBe('a1');
  });

  it('refuses to move below the last row', () => {
    const { nav } = board(ROWS);
    nav.focus('c1');

    expect(nav.handle('down')).toBe(false);
    expect(nav.focusedId).toBe('c1');
  });
});

describe('in a grid', () => {
  it('keeps the column walking down', () => {
    const { nav } = board(ROWS, true);
    nav.focus('a0');
    nav.handle('right');

    nav.handle('down');

    expect(nav.focusedId).toBe('b1');
  });

  it('keeps the column walking up', () => {
    const { nav } = board(ROWS, true);
    nav.focus('c0');
    nav.handle('right');
    nav.handle('right');

    nav.handle('up');

    expect(nav.focusedId).toBe('b2');
  });

  it('keeps the column across two rows', () => {
    const { nav } = board(ROWS, true);
    nav.focus('a2');

    nav.handle('down');
    nav.handle('down');

    expect(nav.focusedId).toBe('c2');
  });

  it('forgets the column once the row is walked sideways', () => {
    const { nav } = board(ROWS, true);
    nav.focus('a2');
    nav.handle('down');
    nav.handle('left');

    nav.handle('down');

    expect(nav.focusedId).toBe('c1');
  });

  it.each([
    {
      behaviour: 'falls back to the nearest lower index when the column has no tile',
      from: 'g2',
      direction: 'up',
      lands: 'head',
    },
    {
      behaviour: 'enters the grid from the control above it',
      from: 'head',
      direction: 'down',
      lands: 'g0',
    },
    {
      behaviour: 'leaves the grid onto the control above it',
      from: 'g0',
      direction: 'up',
      lands: 'head',
    },
  ] as const)('$behaviour', ({ from, direction, lands }) => {
    const { nav } = board(HEADED_GRID, true);
    nav.focus(from);

    nav.handle(direction);

    expect(nav.focusedId).toBe(lands);
  });

  it('walks past a grid row that holds nothing, keeping the column', () => {
    const { nav } = board([['g0', 'g1', 'g2'], [], ['h0', 'h1', 'h2']], true);
    nav.focus('g1');

    nav.handle('down');

    expect(nav.focusedId).toBe('h1');
  });

  it('refuses to leave a grid row when every row ahead holds nothing', () => {
    const { nav } = board([['g0', 'g1', 'g2'], []], true);
    nav.focus('g1');

    expect(nav.handle('down')).toBe(false);
    expect(nav.focusedId).toBe('g1');
  });

  it('walks a grid whose children are tiles, which have no column of their own', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('page', { orientation: 'vertical', alignInGrid: true });
    nav.registerNode('a', { parent: 'page', focusable: true });
    nav.registerNode('b', { parent: 'page', focusable: true });
    nav.focus('a');

    nav.handle('down');

    expect(nav.focusedId).toBe('b');
  });

  it('lands on the remembered row rather than the first, entering an unaligned page', () => {
    const { nav } = board(HEADED_GRID);
    nav.focus('g2');
    nav.handle('up');

    nav.handle('down');

    expect(nav.focusedId).toBe('g2');
  });
});

describe('the edge listener', () => {
  it('hears a direction handled with nowhere to move', () => {
    const { nav } = row(['a0']);
    const edges: string[] = [];
    nav.onEdge = (direction) => edges.push(direction);
    nav.focus('a0');

    nav.handle('right');

    expect(edges).toEqual(['right']);
  });

  it('stays quiet when the focus moved', () => {
    const { nav } = row(['a0', 'a1']);
    const edges: string[] = [];
    nav.onEdge = (direction) => edges.push(direction);
    nav.focus('a0');

    nav.handle('right');

    expect(edges).toEqual([]);
  });

  it('stays quiet while the navigator is locked', () => {
    const { nav } = row(['a0']);
    const edges: string[] = [];
    nav.onEdge = (direction) => edges.push(direction);
    nav.focus('a0');
    nav.lock();

    nav.handle('right');

    expect(edges).toEqual([]);
  });
});

describe('nested containers', () => {
  it('climbs out of a column into the row that holds it', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('page', { orientation: 'horizontal' });
    nav.registerNode('side', { parent: 'page', orientation: 'vertical' });
    nav.registerNode('side0', { parent: 'side', focusable: true });
    nav.registerNode('side1', { parent: 'side', focusable: true });
    nav.registerNode('main', { parent: 'page', focusable: true });

    nav.focus('side1');
    nav.handle('right');

    expect(nav.focusedId).toBe('main');
  });

  it('descends back into the column on the child it left', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('page', { orientation: 'horizontal' });
    nav.registerNode('side', { parent: 'page', orientation: 'vertical' });
    nav.registerNode('side0', { parent: 'side', focusable: true });
    nav.registerNode('side1', { parent: 'side', focusable: true });
    nav.registerNode('main', { parent: 'page', focusable: true });
    nav.focus('side1');
    nav.handle('right');

    nav.handle('left');

    expect(nav.focusedId).toBe('side1');
  });

  it('walks past a container holding nothing focusable', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('page', { orientation: 'horizontal' });
    nav.registerNode('a', { parent: 'page', focusable: true });
    nav.registerNode('empty', { parent: 'page', orientation: 'vertical' });
    nav.registerNode('b', { parent: 'page', focusable: true });

    nav.focus('a');
    nav.handle('right');

    expect(nav.focusedId).toBe('b');
  });
});
