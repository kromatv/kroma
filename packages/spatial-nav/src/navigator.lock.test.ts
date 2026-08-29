import { describe, expect, it } from 'vitest';
import { row } from './tree.fixture';

const TILES = ['a0', 'a1', 'a2'];

describe('lock', () => {
  it('reports itself unlocked to begin with', () => {
    const { nav } = row(TILES);

    expect(nav.locked).toBe(false);
  });

  it('stops a direction from moving the focus', () => {
    const { nav } = row(TILES);
    nav.focus('a0');

    nav.lock();

    expect(nav.handle('right')).toBe(false);
    expect(nav.focusedId).toBe('a0');
  });

  it('stops a select from firing', () => {
    const strip = row(TILES);
    strip.nav.focus('a0');
    strip.nav.lock();
    strip.events.length = 0;

    strip.nav.handle('enter');

    expect(strip.events).toEqual([]);
  });

  it('moves the focus again once it is unlocked', () => {
    const { nav } = row(TILES);
    nav.focus('a0');
    nav.lock();

    nav.unlock();

    expect(nav.handle('right')).toBe(true);
    expect(nav.focusedId).toBe('a1');
  });

  it('counts locks, so two surfaces need two unlocks', () => {
    const { nav } = row(TILES);
    nav.focus('a0');
    nav.lock();
    nav.lock();

    nav.unlock();

    expect(nav.locked).toBe(true);
    expect(nav.handle('right')).toBe(false);
  });

  it('unlocks whichever order the surfaces close in', () => {
    const { nav } = row(TILES);
    nav.focus('a0');
    nav.lock();
    nav.lock();

    nav.unlock();
    nav.unlock();

    expect(nav.locked).toBe(false);
    expect(nav.handle('right')).toBe(true);
  });

  it('ignores an unlock it was never locked for', () => {
    const { nav } = row(TILES);
    nav.focus('a0');

    nav.unlock();
    nav.lock();

    expect(nav.locked).toBe(true);
    expect(nav.handle('right')).toBe(false);
  });

  it('leaves the focus where the lock found it', () => {
    const strip = row(TILES);
    strip.nav.focus('a1');
    strip.nav.lock();

    strip.nav.handle('right');
    strip.nav.handle('left');

    expect([...strip.focusedIds]).toEqual(['a1']);
  });

  it('leaves imperative focus alone', () => {
    const { nav } = row(TILES);
    nav.focus('a0');
    nav.lock();

    expect(nav.focus('a2')).toBe(true);
    expect(nav.focusedId).toBe('a2');
  });

  it('keeps registering nodes while locked', () => {
    const { nav } = row(TILES);
    nav.focus('a0');
    nav.lock();

    nav.registerNode('a3', { parent: 'row0', focusable: true });
    nav.unlock();
    nav.handle('right');
    nav.handle('right');
    nav.handle('right');

    expect(nav.focusedId).toBe('a3');
  });
});
