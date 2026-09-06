import { describe, expect, it } from 'vitest';
import { type GridGeometry, lettersOnScreen, rowOffset, visibleItems } from './gridScroll';

const grid: GridGeometry = { header: 300, gap: 16, rowH: 170, cols: 3, count: 20 };

describe('rowOffset', () => {
  it('places the first row under the header and the rest a pitch apart', () => {
    expect(rowOffset(grid, 0)).toBe(300);
    expect(rowOffset(grid, 2)).toBe(300 + 2 * 186);
  });
});

describe('visibleItems', () => {
  it('reports nothing while only the header is on screen', () => {
    expect(visibleItems(grid, 0, 300)).toBeNull();
  });

  it('spans the rows that cross the viewport, as item indices', () => {
    expect(visibleItems(grid, 0, 480)).toEqual({ first: 0, last: 2 });
    expect(visibleItems(grid, 470, 900)).toEqual({ first: 3, last: 11 });
  });

  it('stops at the last item of a ragged final row', () => {
    expect(visibleItems(grid, 1400, 5000)).toEqual({ first: 18, last: 19 });
  });

  it('reports nothing for an empty grid', () => {
    expect(visibleItems({ ...grid, count: 0 }, 0, 900)).toBeNull();
  });
});

describe('lettersOnScreen', () => {
  const marks = [
    { letter: '#', index: 0 },
    { letter: 'A', index: 2 },
    { letter: 'C', index: 9 },
  ];

  it('is undefined with nothing on screen', () => {
    expect(lettersOnScreen(marks, 20, null)).toBeUndefined();
  });

  it('covers every section holding a visible item', () => {
    expect(lettersOnScreen(marks, 20, { first: 0, last: 2 })).toEqual({ first: '#', last: 'A' });
    expect(lettersOnScreen(marks, 20, { first: 3, last: 8 })).toEqual({ first: 'A', last: 'A' });
    expect(lettersOnScreen(marks, 20, { first: 3, last: 11 })).toEqual({ first: 'A', last: 'C' });
  });

  it('is undefined when the list has no marks', () => {
    expect(lettersOnScreen([], 20, { first: 0, last: 2 })).toBeUndefined();
  });
});
