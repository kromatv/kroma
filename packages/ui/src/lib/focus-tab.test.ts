import { Directions } from 'react-tv-space-navigation';
import { describe, expect, it } from 'vitest';
import type { FocusBox } from './focus-here';
import { walkTab } from './focus-tab';

const COLS = 3;
const ROWS = 2;
const TILE = { w: 100, h: 50 };

/** A grid the navigator would give us: arrows stop at the walls, and a move
 *  bumps the counter exactly as a real focus does. */
function grid(start: { row: number; col: number }) {
  const at = { ...start };
  let seq = 0;
  const move = (row: number, col: number) => {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    at.row = row;
    at.col = col;
    seq += 1;
  };
  return {
    at,
    sent: [] as Directions[],
    probe: {
      seq: () => seq,
      box: () => ({ top: at.row * TILE.h, left: at.col * TILE.w, height: TILE.h }),
    },
    send(direction: Directions) {
      this.sent.push(direction);
      if (direction === Directions.RIGHT) move(at.row, at.col + 1);
      if (direction === Directions.LEFT) move(at.row, at.col - 1);
      if (direction === Directions.DOWN) move(at.row + 1, at.col);
      if (direction === Directions.UP) move(at.row - 1, at.col);
    },
  };
}

describe('walkTab', () => {
  it('steps along the line while the line lasts', () => {
    const g = grid({ row: 0, col: 0 });
    walkTab((d) => g.send(d), g.probe);
    expect(g.at).toEqual({ row: 0, col: 1 });
    expect(g.sent).toEqual([Directions.RIGHT]);
  });

  it('turns the corner: the end of a row continues at the START of the next', () => {
    const g = grid({ row: 0, col: COLS - 1 });
    walkTab((d) => g.send(d), g.probe);
    expect(g.at).toEqual({ row: 1, col: 0 });
  });

  it('walks backwards to the END of the row above', () => {
    const g = grid({ row: 1, col: 0 });
    walkTab((d) => g.send(d), g.probe, true);
    expect(g.at).toEqual({ row: 0, col: COLS - 1 });
  });

  it('stays put at the last control, having nowhere to turn to', () => {
    const g = grid({ row: ROWS - 1, col: COLS - 1 });
    walkTab((d) => g.send(d), g.probe);
    expect(g.at).toEqual({ row: ROWS - 1, col: COLS - 1 });
  });

  it('stops at the start of the line rather than rewinding off it', () => {
    // A row with something to its left that is NOT part of it - a sidebar - is
    // what the box test is for: the rewind must not fall into it.
    type Id = 'last' | 'end' | 'start' | 'menu';
    const NODES: Record<Id, { box: FocusBox; to: Partial<Record<Directions, Id>> }> = {
      last: { box: { top: 0, left: 100, height: 50 }, to: { [Directions.DOWN]: 'end' } },
      end: { box: { top: 50, left: 100, height: 50 }, to: { [Directions.LEFT]: 'start' } },
      start: {
        box: { top: 50, left: 0, height: 50 },
        to: { [Directions.LEFT]: 'menu', [Directions.RIGHT]: 'end' },
      },
      menu: { box: { top: -200, left: -150, height: 400 }, to: { [Directions.RIGHT]: 'start' } },
    };
    let at: Id = 'last';
    let seq = 0;
    const probe = { seq: () => seq, box: () => NODES[at].box };
    walkTab((direction) => {
      const next = NODES[at].to[direction];
      if (!next) return;
      at = next;
      seq += 1;
    }, probe);
    expect(at).toBe('start');
  });

  it('stops when the row it dropped into loops instead of ending', () => {
    // A looping rail answers LEFT at its first tile with its LAST tile: the
    // rewind is refused nothing and the box never leaves the line, so "keep
    // going while the line goes backwards" is the only thing that ends the walk.
    type Id = 'above' | 'first' | 'last';
    const NODES: Record<Id, { box: FocusBox; to: Partial<Record<Directions, Id>> }> = {
      above: { box: { top: 0, left: 200, height: 50 }, to: { [Directions.DOWN]: 'last' } },
      last: { box: { top: 50, left: 200, height: 50 }, to: { [Directions.LEFT]: 'first' } },
      first: { box: { top: 50, left: 0, height: 50 }, to: { [Directions.LEFT]: 'last' } },
    };
    let at: Id = 'above';
    let seq = 0;
    let sends = 0;
    const probe = { seq: () => seq, box: () => NODES[at].box };
    walkTab((direction) => {
      sends += 1;
      const next = NODES[at].to[direction];
      if (!next) return;
      at = next;
      seq += 1;
    }, probe);
    // It walked back to the first tile, saw the next step wrap forward, and
    // stopped there rather than riding the loop to MAX_STEPS.
    expect(at).toBe('last');
    expect(sends).toBeLessThan(6);
  });

  // A box the platform will not measure - a node that has just unmounted, a view
  // with no layout yet - leaves the walk unable to tell one line from the next.
  // Guessing there is how a Tab lands somewhere the eye is not, so it stops.
  //
  // Both sides matter: the box is read BEFORE the rewind and again after it, and
  // either read can come back empty.
  function refusesAlong() {
    let seq = 0;
    const sent: Directions[] = [];
    // The line has ended (RIGHT refused), so the walk drops to the next one and
    // starts rewinding: every other direction moves.
    const send = (d: Directions) => {
      sent.push(d);
      if (d !== Directions.RIGHT) seq += 1;
    };
    return { sent, send, seq: () => seq };
  }

  const WALKED = [Directions.RIGHT, Directions.DOWN, Directions.LEFT];

  it('stops when the box BEFORE the rewind cannot be measured', () => {
    const g = refusesAlong();
    walkTab(g.send, { seq: g.seq, box: () => null });
    expect(g.sent).toEqual(WALKED);
  });

  it('stops when the box AFTER the rewind cannot be measured', () => {
    const g = refusesAlong();
    let reads = 0;
    const box = (): FocusBox | null => (reads++ === 0 ? { top: 50, left: 100, height: 50 } : null);
    walkTab(g.send, { seq: g.seq, box });
    expect(g.sent).toEqual(WALKED);
  });
});
