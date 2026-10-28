import { describe, expect, it } from 'vitest';
import type { Direction } from './directions';
import { SpatialNavigator } from './spatial-navigator';

function strip(
  answer: (direction: Direction) => boolean,
  onRow?: (direction: Direction) => boolean,
) {
  const nav = new SpatialNavigator();
  const selected: string[] = [];
  nav.registerNode('root', { orientation: 'vertical' });
  nav.registerNode('row', { parent: 'root', orientation: 'horizontal', onKey: onRow });
  nav.registerNode('seek', {
    parent: 'row',
    focusable: true,
    onKey: answer,
    onSelect: () => selected.push('seek'),
  });
  nav.registerNode('play', {
    parent: 'row',
    focusable: true,
    onSelect: () => selected.push('play'),
  });
  nav.focus('seek');
  return { nav, selected };
}

describe('a node that answers a press', () => {
  it('keeps the press, and the focus stays where it was', () => {
    const { nav } = strip((direction) => direction === 'right');

    expect(nav.handle('right')).toBe(true);
    expect(nav.focusedId).toBe('seek');
  });

  it('lets a press it does not answer move the focus as usual', () => {
    const { nav } = strip(() => false);

    nav.handle('right');

    expect(nav.focusedId).toBe('play');
  });

  it('can keep OK from selecting', () => {
    const { nav, selected } = strip((direction) => direction === 'enter');

    nav.handle('enter');

    expect(selected).toEqual([]);
  });

  it('hears the press on a container above the focused node', () => {
    const heard: Direction[] = [];
    const { nav } = strip(
      () => false,
      (direction) => {
        heard.push(direction);
        return true;
      },
    );

    nav.handle('down');

    expect(heard).toEqual(['down']);
    expect(nav.focusedId).toBe('seek');
  });

  it('is not asked while the navigator is locked', () => {
    const heard: Direction[] = [];
    const { nav } = strip((direction) => {
      heard.push(direction);
      return true;
    });

    nav.lock();
    nav.handle('left');

    expect(heard).toEqual([]);
  });
});
