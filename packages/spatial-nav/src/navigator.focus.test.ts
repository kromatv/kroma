import { SpatialNavigator } from '@kroma/spatial-nav';
import { describe, expect, it } from 'vitest';
import { board, row } from './tree.fixture';

const TILES = ['a0', 'a1', 'a2', 'a3', 'a4'];

const ROWS = [
  ['a0', 'a1'],
  ['b0', 'b1'],
];

describe('focus ownership', () => {
  it('reports no focus before anything has taken it', () => {
    const { nav } = row(TILES);

    expect(nav.focusedId).toBeNull();
  });

  it('holds the focus on exactly one node', () => {
    const strip = row(TILES);

    strip.nav.focus('a2');

    expect([...strip.focusedIds]).toEqual(['a2']);
  });

  it('holds the focus on exactly one node at every step of a walk', () => {
    const strip = row(TILES);
    strip.nav.focus('a0');

    const counts = TILES.slice(1).map(() => {
      strip.nav.handle('right');
      return strip.focusedIds.size;
    });

    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it('holds the focus on exactly one node walking back the way it came', () => {
    const strip = row(TILES);
    strip.nav.focus('a4');

    const counts = TILES.slice(1).map(() => {
      strip.nav.handle('left');
      return strip.focusedIds.size;
    });

    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it('holds the focus on exactly one node across rows', () => {
    const page = board(ROWS);
    page.nav.focus('a0');

    page.nav.handle('right');
    page.nav.handle('down');
    page.nav.handle('up');

    expect([...page.focusedIds]).toEqual(['a1']);
  });

  it('blurs the node it takes the focus from', () => {
    const strip = row(TILES);
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.focus('a3');

    expect(strip.events).toEqual(['blur:a0', 'focus:a3']);
  });

  it('blurs before it focuses', () => {
    const strip = row(TILES);
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.handle('right');

    expect(strip.events).toEqual(['blur:a0', 'focus:a1']);
  });

  it('fires one blur per node it leaves', () => {
    const strip = row(TILES);
    strip.nav.focus('a0');
    strip.nav.handle('right');
    strip.nav.handle('right');

    expect(strip.events.filter((event) => event === 'blur:a0')).toHaveLength(1);
  });

  it('fires nothing when asked to focus the node that already holds it', () => {
    const strip = row(TILES);
    strip.nav.focus('a1');
    strip.events.length = 0;

    strip.nav.focus('a1');

    expect(strip.events).toEqual([]);
  });

  it('digs down to the first focusable descendant when asked to focus a container', () => {
    const { nav } = board(ROWS);

    nav.focus('page');

    expect(nav.focusedId).toBe('a0');
  });

  it('digs down to the remembered descendant of a container it has left', () => {
    const { nav } = board(ROWS);
    nav.focus('b1');
    nav.focus('a0');

    nav.focus('row1');

    expect(nav.focusedId).toBe('b1');
  });

  it('refuses an id it does not hold and leaves the focus where it was', () => {
    const { nav } = row(TILES);
    nav.focus('a1');

    expect(nav.focus('ghost')).toBe(false);
    expect(nav.focusedId).toBe('a1');
  });

  it('takes the first focusable node on the first direction, having none', () => {
    const { nav } = board(ROWS);

    expect(nav.handle('right')).toBe(true);
    expect(nav.focusedId).toBe('a0');
  });

  it('refuses a direction when the tree holds nothing focusable', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('empty', { orientation: 'horizontal' });

    expect(nav.handle('right')).toBe(false);
    expect(nav.focusedId).toBeNull();
  });

  it('refuses a container holding nothing focusable', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('empty', { orientation: 'horizontal' });

    expect(nav.focus('empty')).toBe(false);
    expect(nav.focusedId).toBeNull();
  });
});

describe('select', () => {
  it('fires on the node holding the focus', () => {
    const strip = row(TILES);
    strip.nav.focus('a2');
    strip.events.length = 0;

    expect(strip.nav.handle('enter')).toBe(true);
    expect(strip.events).toEqual(['select:a2']);
  });

  it('does nothing while nothing is focused', () => {
    const strip = row(TILES);

    expect(strip.nav.handle('enter')).toBe(false);
    expect(strip.events).toEqual([]);
  });

  it('leaves the focus where it was', () => {
    const { nav } = row(TILES);
    nav.focus('a2');

    nav.handle('enter');

    expect(nav.focusedId).toBe('a2');
  });
});

describe('the active path', () => {
  it('activates the containers between the root and the focused node', () => {
    const page = board(ROWS);

    page.nav.focus('a0');

    expect(page.events).toEqual(['active:page', 'active:row0', 'active:a0', 'focus:a0']);
  });

  it('deactivates the container the focus walks out of', () => {
    const page = board(ROWS);
    page.nav.focus('a0');
    page.events.length = 0;

    page.nav.handle('down');

    expect(page.events).toContain('inactive:row0');
    expect(page.events).toContain('active:row1');
  });

  it('activates a container walking back the way it came', () => {
    const page = board(ROWS);
    page.nav.focus('a0');
    page.nav.handle('down');
    page.events.length = 0;

    page.nav.handle('up');

    expect(page.events).toContain('inactive:row1');
    expect(page.events).toContain('active:row0');
  });

  it('leaves an ancestor active while the focus moves inside it', () => {
    const page = board(ROWS);
    page.nav.focus('a0');
    page.events.length = 0;

    page.nav.handle('right');

    expect(page.events).not.toContain('inactive:row0');
    expect(page.events).not.toContain('active:row0');
  });
});
