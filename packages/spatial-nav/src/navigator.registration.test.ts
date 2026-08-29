import { SpatialNavigator } from '@kroma/spatial-nav';
import { describe, expect, it } from 'vitest';
import { row, tracker } from './tree.fixture';

const TILES = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];

function reregister(nav: SpatialNavigator, ids: readonly string[]) {
  for (const id of ids) nav.registerNode(id, { parent: 'row0', focusable: true });
}

describe('registerNode', () => {
  it('is a no-op when the id is already held, rather than a throw', () => {
    const { nav } = row(TILES);

    expect(() => nav.registerNode('a3', { parent: 'row0', focusable: true })).not.toThrow();
  });

  it('keeps the first registration when a second one declares a different index', () => {
    const { nav } = row(['a0', 'a1', 'a2']);

    nav.registerNode('a0', { parent: 'row0', focusable: true, index: 9 });
    nav.focus('a0');
    nav.handle('right');

    expect(nav.focusedId).toBe('a1');
  });

  it('keeps the first registration when a second one names a different parent', () => {
    const { nav } = row(['a0', 'a1']);
    nav.registerNode('elsewhere', { orientation: 'horizontal' });

    nav.registerNode('a1', { parent: 'elsewhere', focusable: true });
    nav.focus('a0');
    nav.handle('right');

    expect(nav.focusedId).toBe('a1');
  });

  it('leaves the whole row walkable after a window re-registers its tail', () => {
    const { nav } = row(TILES);

    reregister(nav, TILES.slice(4));
    nav.focus('a0');
    const reached = TILES.slice(1).map(() => {
      nav.handle('right');
      return nav.focusedId;
    });

    expect(reached).toEqual(TILES.slice(1));
  });

  it('still fires focus and blur after a duplicate registration', () => {
    const board = row(['a0', 'a1']);

    board.nav.registerNode('a1', { parent: 'row0', focusable: true });
    board.nav.focus('a0');
    board.events.length = 0;
    board.nav.handle('right');

    expect(board.events).toEqual(['blur:a0', 'focus:a1']);
  });

  it('attaches a node registered before its parent, once the parent arrives', () => {
    const nav = new SpatialNavigator();

    nav.registerNode('tile', { parent: 'late', focusable: true });
    nav.registerNode('late', { orientation: 'horizontal' });

    expect(nav.focus('tile')).toBe(true);
    expect(nav.focusedId).toBe('tile');
  });

  it('attaches a whole branch registered leaves first', () => {
    const nav = new SpatialNavigator();

    nav.registerNode('tile', { parent: 'row', focusable: true });
    nav.registerNode('row', { parent: 'page', orientation: 'horizontal' });
    nav.registerNode('page', { orientation: 'vertical' });

    expect(nav.focus('page')).toBe(true);
    expect(nav.focusedId).toBe('tile');
  });

  it('drops a deferred node that is unregistered before its parent arrives', () => {
    const nav = new SpatialNavigator();

    nav.registerNode('tile', { parent: 'late', focusable: true });
    nav.unregisterNode('tile');
    nav.registerNode('late', { orientation: 'horizontal' });

    expect(nav.focus('tile')).toBe(false);
    expect(nav.focusedId).toBeNull();
  });
});

describe('unregisterNode', () => {
  it('is a no-op for an id it does not hold', () => {
    const { nav } = row(['a0']);
    nav.focus('a0');

    expect(() => nav.unregisterNode('never-registered')).not.toThrow();
    expect(nav.focusedId).toBe('a0');
  });

  it('is a no-op the second time the same id is unregistered', () => {
    const { nav } = row(['a0', 'a1']);
    nav.focus('a1');

    nav.unregisterNode('a0');

    expect(() => nav.unregisterNode('a0')).not.toThrow();
    expect(nav.focusedId).toBe('a1');
  });

  it('fires no callback for an id it does not hold', () => {
    const track = tracker();
    const nav = new SpatialNavigator();
    nav.registerNode('a0', { focusable: true, ...track.on('a0') });

    nav.unregisterNode('ghost');

    expect(track.events).toEqual([]);
  });

  it('takes a subtree with the node it removes', () => {
    const { nav } = row(['a0', 'a1']);
    nav.focus('a0');

    nav.unregisterNode('row0');

    expect(nav.focus('a1')).toBe(false);
    expect(nav.focusedId).toBeNull();
  });

  it('lets an id be registered again after it is unregistered', () => {
    const { nav } = row(['a0', 'a1']);

    nav.unregisterNode('a1');
    nav.registerNode('a1', { parent: 'row0', focusable: true });
    nav.focus('a0');
    nav.handle('right');

    expect(nav.focusedId).toBe('a1');
  });
});
