import { describe, expect, it } from 'vitest';
import {
  bandAt,
  barPath,
  baselineOf,
  columnOf,
  domainOf,
  indexAtX,
  px,
  stackBase,
  ticksOf,
  valueFor,
  xAt,
  yAt,
} from './chart-scale';

const BOX = { width: 100, height: 50 };
const UNIT = { min: 0, max: 1 };

describe('valueFor', () => {
  it('takes a finite number and nothing else', () => {
    expect(valueFor({ a: 3 }, 'a')).toBe(3);
    expect(valueFor({ a: 0 }, 'a')).toBe(0);
    expect(valueFor({ a: 'S12' }, 'a')).toBeNull();
    expect(valueFor({ a: null }, 'a')).toBeNull();
    expect(valueFor({ a: Number.NaN }, 'a')).toBeNull();
    expect(valueFor({}, 'a')).toBeNull();
    expect(valueFor(undefined, 'a')).toBeNull();
  });

  it('reads one field off every point in order', () => {
    expect(columnOf([{ a: 1 }, { b: 2 }, { a: 3 }], 'a')).toEqual([1, null, 3]);
  });
});

describe('domainOf', () => {
  it('spans every series so two are read against each other', () => {
    expect(domainOf([[1, 9], [4]])).toEqual({ min: 1, max: 9 });
  });

  it('gives empty data a drawable unit range', () => {
    expect(domainOf([])).toEqual(UNIT);
    expect(domainOf([[]])).toEqual(UNIT);
    expect(domainOf([[null, null]])).toEqual(UNIT);
  });

  it('opens an all-zero series onto the floor rather than dividing by zero', () => {
    expect(domainOf([[0, 0, 0]])).toEqual(UNIT);
    expect(domainOf([[0, 0, 0]], { baseline: true })).toEqual(UNIT);
  });

  it('opens a flat non-zero line symmetrically, and a baselined one to zero', () => {
    expect(domainOf([[42, 42]])).toEqual({ min: 41, max: 43 });
    expect(domainOf([[42, 42]], { baseline: true })).toEqual({ min: 0, max: 42 });
    expect(domainOf([[-5, -5]])).toEqual({ min: -6, max: -4 });
  });

  it('lets a caller pin either end, and widens a pair that would collapse', () => {
    expect(domainOf([[3, 7]], { min: 0, max: 100 })).toEqual({ min: 0, max: 100 });
    expect(domainOf([[3, 7]], { max: 0 })).toEqual({ min: 3, max: 4 });
    expect(domainOf([[0, 0]], { min: 0, max: 0 })).toEqual(UNIT);
  });

  it('pulls zero in for a baselined mark and keeps a negative run', () => {
    expect(domainOf([[4, 9]], { baseline: true })).toEqual({ min: 0, max: 9 });
    expect(domainOf([[-4, 9]], { baseline: true })).toEqual({ min: -4, max: 9 });
  });
});

describe('the scales', () => {
  it('spreads samples from edge to edge, and centres a lone one', () => {
    expect(xAt(0, 3, 100)).toBe(0);
    expect(xAt(1, 3, 100)).toBe(50);
    expect(xAt(2, 3, 100)).toBe(100);
    expect(xAt(0, 1, 100)).toBe(50);
    expect(xAt(0, 0, 100)).toBe(50);
  });

  it('gives every sample an equal band, with the bar centred in it', () => {
    const band = bandAt(0, 2, 100);
    expect(band.width).toBeCloseTo(31);
    expect(band.x + band.width / 2).toBeCloseTo(25);
    expect(bandAt(1, 2, 100).x + bandAt(1, 2, 100).width / 2).toBeCloseTo(75);
    expect(bandAt(0, 0, 100)).toEqual({ x: 0, width: 100 });
  });

  it('inverts the value axis and clamps anything outside the domain', () => {
    expect(yAt(1, UNIT, BOX)).toBe(0);
    expect(yAt(0, UNIT, BOX)).toBe(50);
    expect(yAt(0.5, UNIT, BOX)).toBe(25);
    expect(yAt(9, UNIT, BOX)).toBe(0);
    expect(yAt(-9, UNIT, BOX)).toBe(50);
  });

  it('measures a baselined mark from zero, or from the nearer edge', () => {
    expect(baselineOf({ min: -5, max: 5 })).toBe(0);
    expect(baselineOf({ min: 10, max: 20 })).toBe(10);
    expect(baselineOf({ min: -20, max: -10 })).toBe(-10);
  });

  it('quantises to a tenth of a pixel', () => {
    expect(px(12.3456)).toBe(12.3);
  });
});

describe('ticksOf', () => {
  it('lands on both ends', () => {
    expect(ticksOf({ min: 0, max: 100 }, 5)).toEqual([0, 25, 50, 75, 100]);
    expect(ticksOf(UNIT, 1)).toEqual([0]);
  });
});

describe('indexAtX', () => {
  it('has nothing to land on without samples or width', () => {
    expect(indexAtX(10, 0, 100)).toBeNull();
    expect(indexAtX(10, 5, 0)).toBeNull();
  });

  it('takes the nearest sample, and clamps past either edge', () => {
    expect(indexAtX(0, 3, 100)).toBe(0);
    expect(indexAtX(49, 3, 100)).toBe(1);
    expect(indexAtX(100, 3, 100)).toBe(2);
    expect(indexAtX(-40, 3, 100)).toBe(0);
    expect(indexAtX(400, 3, 100)).toBe(2);
  });

  it('takes the band a sample owns when bars are drawn', () => {
    expect(indexAtX(10, 4, 100, true)).toBe(0);
    expect(indexAtX(30, 4, 100, true)).toBe(1);
    expect(indexAtX(100, 4, 100, true)).toBe(3);
  });
});

describe('stackBase', () => {
  it('is the floor for the first bar in a stack', () => {
    expect(stackBase([], 3)).toEqual([0, 0, 0]);
  });

  it('sums the bars declared below, counting a gap as nothing', () => {
    expect(
      stackBase(
        [
          [1, 2, null],
          [10, 20, 30],
        ],
        3,
      ),
    ).toEqual([11, 22, 30]);
  });
});

describe('barPath', () => {
  const BAR = { x: 0, width: 20, y: 0, height: 40 };
  const curves = (d: string) => (d.match(/Q/g) ?? []).length;

  it('rounds all four corners of a column that is one segment', () => {
    expect(curves(barPath(BAR, { top: 4, bottom: 4 }))).toBe(4);
  });

  it('leaves the join between two segments square', () => {
    expect(curves(barPath(BAR, { top: 4, bottom: 0 }))).toBe(2);
    expect(curves(barPath(BAR, { top: 0, bottom: 4 }))).toBe(2);
    expect(curves(barPath(BAR, { top: 0, bottom: 0 }))).toBe(0);
  });

  it('closes the box whichever corners it rounds', () => {
    expect(barPath(BAR, { top: 0, bottom: 0 })).toBe('M0 0L20 0L20 40L0 40Z');
  });

  it('clamps a radius the segment is too short to draw', () => {
    const squat = { x: 0, width: 20, y: 0, height: 6 };
    expect(barPath(squat, { top: 40, bottom: 40 })).toBe(
      'M0 3Q0 0,3 0L17 0Q20 0,20 3L20 3Q20 6,17 6L3 6Q0 6,0 3Z',
    );
  });
});
