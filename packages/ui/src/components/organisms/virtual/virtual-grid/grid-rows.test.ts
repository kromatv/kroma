import { describe, expect, it } from 'vitest';
import { freeOffset, pageRow, rowMetrics, rowTop, rowWindow, stripOffset } from './grid-rows';

/** A 350px viewport clips this grid to three rows. */
const GRID = { rows: 10, pitch: 100, header: true, headerSize: 60, viewport: 350 };
const METRICS = rowMetrics(GRID);
const BARE = rowMetrics({ ...GRID, header: false });

describe('rowMetrics', () => {
  it('counts the header as a row of the list', () => {
    expect(METRICS.count).toBe(11);
    expect(METRICS.headerRows).toBe(1);
  });

  it('drops the header height along with the header', () => {
    expect(BARE.count).toBe(10);
    expect(BARE.headerSize).toBe(0);
    expect(BARE.height).toBe(1000);
  });

  it('measures the strip from the header down to the last row', () => {
    expect(METRICS.height).toBe(1060);
  });

  it('shows one row in a viewport too short to hold one', () => {
    expect(rowMetrics({ ...GRID, viewport: 40 }).visible).toBe(1);
  });

  it('keeps the pitch off zero, which is what an unmeasured grid reports', () => {
    expect(rowMetrics({ ...GRID, pitch: 0, viewport: 0 }).pitch).toBe(1);
  });
});

describe('rowTop', () => {
  it('puts the header at the origin', () => {
    expect(rowTop(0, METRICS)).toBe(0);
  });

  it('starts the tiles below the header', () => {
    expect(rowTop(1, METRICS)).toBe(60);
    expect(rowTop(3, METRICS)).toBe(260);
  });

  it('stacks straight from the origin when there is no header', () => {
    expect(rowTop(2, BARE)).toBe(200);
  });
});

describe('pageRow', () => {
  it('parks the page the focus is on, not the focused row', () => {
    expect(pageRow(0, METRICS)).toBe(0);
    expect(pageRow(2, METRICS)).toBe(0);
    expect(pageRow(4, METRICS)).toBe(3);
  });

  it('stops on the last whole page rather than scrolling past the end', () => {
    expect(pageRow(10, METRICS)).toBe(8);
  });

  it('stays at the top while the whole list fits the viewport', () => {
    expect(pageRow(1, rowMetrics({ ...GRID, rows: 2, header: false }))).toBe(0);
  });
});

describe('stripOffset', () => {
  it('is the top of the page the focus sits on', () => {
    expect(stripOffset(4, METRICS)).toBe(260);
  });

  it('leaves the strip alone while the focus moves inside one page', () => {
    expect(stripOffset(2, METRICS)).toBe(0);
  });
});

describe('freeOffset', () => {
  it('matches the press offset at a whole row', () => {
    expect(freeOffset(4, METRICS)).toBe(stripOffset(4, METRICS));
  });

  it('travels between two pages in step with the wheel', () => {
    // Rows 5 and 6 open different pages, at 260 and 560.
    expect(freeOffset(5.5, METRICS)).toBe(410);
  });

  it('stands still inside a page, where a press would not move the strip either', () => {
    expect(freeOffset(1.5, METRICS)).toBe(0);
  });

  it('clamps a wheel that overshoots the top', () => {
    expect(freeOffset(-4.2, METRICS)).toBe(0);
  });

  it('clamps a wheel that overshoots the last row', () => {
    expect(freeOffset(99, METRICS)).toBe(stripOffset(10, METRICS));
  });

  it('sits at the origin when the list is empty', () => {
    expect(freeOffset(3, rowMetrics({ ...GRID, rows: 0, header: false }))).toBe(0);
  });
});

describe('rowWindow', () => {
  it('mounts the page on screen plus the overscan either side', () => {
    expect(rowWindow(4, METRICS, 1)).toEqual({ start: 2, end: 6 });
  });

  it('mounts the page alone when nothing is asked for either side', () => {
    expect(rowWindow(4, METRICS, 0)).toEqual({ start: 3, end: 5 });
  });

  it('never starts before the first row', () => {
    expect(rowWindow(0, METRICS, 2)).toEqual({ start: 0, end: 4 });
  });

  it('never ends past the last row', () => {
    expect(rowWindow(10, METRICS, 2)).toEqual({ start: 6, end: 10 });
  });
});
