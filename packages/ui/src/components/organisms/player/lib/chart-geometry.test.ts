import { describe, expect, it } from 'vitest';
import {
  bandPath,
  CHART_WINDOW,
  type ChartBox,
  endPoint,
  extentOf,
  seriesPath,
  xAt,
  yAt,
} from './chart-geometry';

const box: ChartBox = { width: 100, height: 40, padY: 5, window: 11 };

describe('extentOf', () => {
  it('spans every series, so two meters on one chart share the axis', () => {
    expect(
      extentOf([
        [1, 5],
        [3, 9],
      ]),
    ).toEqual({ min: 1, max: 9 });
  });

  it('widens to include a reference line', () => {
    expect(extentOf([[20, 30]], 10)).toEqual({ min: 10, max: 30 });
    expect(extentOf([[20, 30]], 90)).toEqual({ min: 20, max: 90 });
  });

  it('gives a flat series a symmetric span instead of dividing by zero', () => {
    expect(extentOf([[7, 7, 7]])).toEqual({ min: 6, max: 8 });
  });

  it('ignores non-finite samples', () => {
    expect(extentOf([[Number.NaN, 4, Number.POSITIVE_INFINITY, 6]])).toEqual({ min: 4, max: 6 });
  });

  it('falls back to 0..1 with nothing to measure', () => {
    expect(extentOf([])).toEqual({ min: 0, max: 1 });
    expect(extentOf([[]])).toEqual({ min: 0, max: 1 });
  });
});

describe('xAt', () => {
  it('puts the newest sample on the right edge', () => {
    expect(xAt(4, 5, box)).toBe(100);
    expect(xAt(10, 11, box)).toBe(100);
  });

  it('keeps one sample the same width whatever the history length', () => {
    const step = xAt(4, 5, box) - xAt(3, 5, box);
    expect(xAt(10, 11, box) - xAt(9, 11, box)).toBeCloseTo(step);
    expect(step).toBeCloseTo(10);
  });

  it('leaves a short history short of the left edge', () => {
    expect(xAt(0, 3, box)).toBe(80);
  });

  it('reaches the left edge once the window is full', () => {
    expect(xAt(0, 11, box)).toBe(0);
  });

  it('stacks every sample on the right edge for a window of one', () => {
    const single: ChartBox = { width: 100, height: 40, padY: 5, window: 1 };
    expect(xAt(0, 3, single)).toBe(100);
    expect(xAt(2, 3, single)).toBe(100);
  });
});

describe('yAt', () => {
  const extent = { min: 0, max: 10 };

  it('inverts: the maximum sits at the top inset', () => {
    expect(yAt(10, extent, box)).toBe(5);
  });

  it('puts the minimum at the bottom inset', () => {
    expect(yAt(0, extent, box)).toBe(35);
  });

  it('centres the midpoint', () => {
    expect(yAt(5, extent, box)).toBe(20);
  });

  it('centres everything when the extent has no span', () => {
    expect(yAt(3, { min: 3, max: 3 }, box)).toBe(20);
  });
});

describe('seriesPath', () => {
  it('draws nothing from fewer than two samples', () => {
    expect(seriesPath([], { min: 0, max: 1 }, box)).toBe('');
    expect(seriesPath([5], { min: 0, max: 10 }, box)).toBe('');
  });

  it('opens with a move and continues with lines', () => {
    const d = seriesPath([0, 10], { min: 0, max: 10 }, box);
    expect(d).toBe('M90 35L100 5');
  });

  it('emits one command per sample', () => {
    const d = seriesPath([1, 2, 3, 4], { min: 1, max: 4 }, box);
    expect(d.match(/[ML]/g)).toHaveLength(4);
  });

  it('substitutes the floor for a non-finite sample rather than breaking the path', () => {
    const d = seriesPath([0, Number.NaN, 10], { min: 0, max: 10 }, box);
    expect(d).not.toContain('NaN');
  });
});

describe('bandPath', () => {
  it('closes the region between the two traces', () => {
    const d = bandPath([10, 10], [0, 0], { min: 0, max: 10 }, box);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    // Out along the upper trace, back along the lower: two points each.
    expect(d.match(/[ML]/g)).toHaveLength(4);
  });

  it('draws nothing without two samples in both traces', () => {
    expect(bandPath([1], [0], { min: 0, max: 1 }, box)).toBe('');
    expect(bandPath([1, 2], [0], { min: 0, max: 2 }, box)).toBe('');
  });

  it('uses the shorter of the two traces', () => {
    const d = bandPath([1, 2, 3], [0, 0], { min: 0, max: 3 }, box);
    expect(d.match(/[ML]/g)).toHaveLength(4);
  });
});

describe('endPoint', () => {
  it('lands on the right edge at the newest value', () => {
    expect(endPoint([0, 10], { min: 0, max: 10 }, box)).toEqual({ x: 100, y: 5 });
  });

  it('is null while there is no line to anchor to', () => {
    expect(endPoint([5], { min: 0, max: 10 }, box)).toBeNull();
  });

  it('drops to the floor rather than off the chart for a value that is not one', () => {
    expect(endPoint([0, Number.NaN], { min: 0, max: 10 }, box)).toEqual({ x: 100, y: 35 });
  });
});

describe('CHART_WINDOW', () => {
  it('is the default window when a box does not name one', () => {
    const unwindowed: ChartBox = { width: 100, height: 40, padY: 5 };
    const step = 100 / (CHART_WINDOW - 1);
    expect(xAt(0, 1, unwindowed)).toBe(100);
    expect(xAt(0, 2, unwindowed)).toBeCloseTo(100 - step);
  });
});
