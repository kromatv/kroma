import { describe, expect, it } from 'vitest';
import { aheadRows } from './ahead-rows';
import { rowMetrics } from './grid-rows';

const metrics = rowMetrics({
  rows: 20,
  pitch: 100,
  gap: 0,
  header: true,
  headerSize: 50,
  viewport: 300,
});

describe('aheadRows', () => {
  it('lists a page and a row below the window when travelling down', () => {
    expect(aheadRows({ start: 1, end: 5 }, true, metrics)).toEqual([6, 7, 8, 9]);
  });

  it('lists the rows above the window nearest first when travelling up', () => {
    expect(aheadRows({ start: 8, end: 12 }, false, metrics)).toEqual([7, 6, 5, 4]);
  });

  it('stops at the header and at the last row', () => {
    expect(aheadRows({ start: 2, end: 6 }, false, metrics)).toEqual([1]);
    expect(aheadRows({ start: 15, end: 19 }, true, metrics)).toEqual([20]);
  });
});
