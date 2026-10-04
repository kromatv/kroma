import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Board, row } from './tree.fixture';

function withHold(board: Board, holding = { on: true }): Board {
  board.nav.registerNode('h', {
    parent: 'row0',
    focusable: true,
    ...board.on('h'),
    holds: () => holding.on,
    onLongSelect: () => board.events.push('hold:h'),
  });
  return board;
}

function pressed(): Board {
  const strip = withHold(row(['a0', 'a1']));
  strip.nav.focus('h');
  strip.events.length = 0;
  return strip;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hold', () => {
  it('selects a node without a hold on the press itself', () => {
    const strip = withHold(row(['a0', 'a1']));
    strip.nav.focus('a1');
    strip.events.length = 0;

    strip.nav.handle('enter');

    expect(strip.events).toEqual(['select:a1']);
  });

  it('waits for the release before it selects a node that holds', () => {
    const strip = pressed();

    strip.nav.handle('enter');
    const before = [...strip.events];
    strip.nav.handle('release');

    expect(before).toEqual([]);
    expect(strip.events).toEqual(['select:h']);
  });

  it('long-selects once OK has been down for half a second, and swallows the release', () => {
    const strip = pressed();

    strip.nav.handle('enter');
    vi.advanceTimersByTime(500);
    strip.nav.handle('release');

    expect(strip.events).toEqual(['hold:h']);
  });

  it('reads the repeats a held key sends as the same press', () => {
    const strip = pressed();

    strip.nav.handle('enter');
    vi.advanceTimersByTime(300);
    strip.nav.handle('enter');
    vi.advanceTimersByTime(300);
    strip.nav.handle('enter');
    strip.nav.handle('release');

    expect(strip.events).toEqual(['hold:h']);
  });

  it('long-selects at once when the platform reports the hold itself', () => {
    const strip = pressed();

    strip.nav.handle('hold');
    strip.nav.handle('release');

    expect(strip.events).toEqual(['hold:h']);
  });

  it('selects a node without a hold when the platform reports one', () => {
    const strip = withHold(row(['a0', 'a1']));
    strip.nav.focus('a0');
    strip.events.length = 0;

    strip.nav.handle('hold');

    expect(strip.events).toEqual(['select:a0']);
  });

  it('drops the press when the focus walks away before the hold', () => {
    const strip = pressed();

    strip.nav.handle('enter');
    strip.nav.handle('left');
    vi.advanceTimersByTime(500);
    strip.nav.handle('release');

    expect(strip.events).toEqual(['blur:h', 'focus:a1']);
  });

  it('holds nothing under a lock that arrived while OK was down, and is not stuck after', () => {
    const strip = pressed();

    strip.nav.handle('enter');
    strip.nav.lock();
    vi.advanceTimersByTime(500);
    strip.nav.handle('release');
    strip.nav.unlock();
    strip.nav.handle('enter');
    strip.nav.handle('release');

    expect(strip.events).toEqual(['select:h']);
  });

  it('asks the node at every press, so a hold can come and go with its props', () => {
    const holding = { on: false };
    const strip = withHold(row(['a0']), holding);
    strip.nav.focus('h');
    strip.events.length = 0;

    strip.nav.handle('enter');
    holding.on = true;
    strip.nav.handle('enter');
    vi.advanceTimersByTime(500);

    expect(strip.events).toEqual(['select:h', 'hold:h']);
  });
});
