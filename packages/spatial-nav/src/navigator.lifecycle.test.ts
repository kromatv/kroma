import { describe, expect, it } from 'vitest';
import { board, row } from './tree.fixture';

const ROWS = [
  ['a0', 'a1'],
  ['b0', 'b1'],
];

describe('unregistering the focused node', () => {
  it('moves the focus to the sibling before it', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a1');

    nav.unregisterNode('a1');

    expect(nav.focusedId).toBe('a0');
  });

  it('moves the focus to the sibling after it when it was the first', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a0');

    nav.unregisterNode('a0');

    expect(nav.focusedId).toBe('a1');
  });

  it('blurs the node it is taking the focus from', () => {
    const strip = row(['a0', 'a1']);
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.unregisterNode('a0');

    expect(strip.events).toEqual(['blur:a0', 'focus:a1']);
  });

  it('leaves exactly one node holding the focus', () => {
    const strip = row(['a0', 'a1', 'a2']);
    strip.nav.focus('a1');

    strip.nav.unregisterNode('a1');

    expect([...strip.focusedIds]).toEqual(['a0']);
  });

  it('never leaves the focus on an id it no longer holds', () => {
    const { nav } = row(['a0', 'a1']);
    nav.focus('a1');

    nav.unregisterNode('a1');

    expect(nav.focusedId).not.toBe('a1');
  });

  it('climbs to another row when the whole row goes', () => {
    const { nav } = board(ROWS);
    nav.focus('b0');

    nav.unregisterNode('row1');

    expect(nav.focusedId).toBe('a0');
  });

  it('reports no focus once the last focusable node goes', () => {
    const { nav } = row(['a0']);
    nav.focus('a0');

    nav.unregisterNode('a0');

    expect(nav.focusedId).toBeNull();
  });

  it('blurs the last focusable node as it goes', () => {
    const strip = row(['a0']);
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.unregisterNode('a0');

    expect(strip.events).toEqual(['blur:a0']);
  });

  it('still walks the row it fell back into', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a1');
    nav.unregisterNode('a1');

    nav.handle('right');

    expect(nav.focusedId).toBe('a2');
  });

  it('takes a focus back after a fresh node is registered', () => {
    const { nav } = row(['a0']);
    nav.focus('a0');
    nav.unregisterNode('a0');

    nav.registerNode('a1', { parent: 'row0', focusable: true });

    expect(nav.focus('a1')).toBe(true);
    expect(nav.focusedId).toBe('a1');
  });
});

describe('unregistering an unfocused node', () => {
  it('leaves the focus where it is', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a0');

    nav.unregisterNode('a2');

    expect(nav.focusedId).toBe('a0');
  });

  it('fires no focus callback', () => {
    const strip = row(['a0', 'a1', 'a2']);
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.unregisterNode('a2');

    expect(strip.events).toEqual([]);
  });

  it('shortens the row it walks', () => {
    const { nav } = row(['a0', 'a1', 'a2']);
    nav.focus('a0');
    nav.unregisterNode('a1');

    nav.handle('right');

    expect(nav.focusedId).toBe('a2');
  });

  it('forgets a remembered child that is gone', () => {
    const { nav } = board(ROWS);
    nav.focus('b1');
    nav.focus('a0');

    nav.unregisterNode('b1');
    nav.handle('down');

    expect(nav.focusedId).toBe('b0');
  });
});
