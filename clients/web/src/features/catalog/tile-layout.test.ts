import { describe, expect, it } from 'vitest';
import { gridShape, rowWindow, tileColumns } from '#web/features/catalog/tile-layout';

const PITCH = 100;

describe('rowWindow', () => {
  it('mounts the rows the viewport covers, plus the overscan either side', () => {
    expect(rowWindow({ rows: 50, pitch: PITCH, top: -1000, viewport: 500, overscan: 2 })).toEqual({
      first: 8,
      count: 9,
    });
  });

  it('starts at the first row while the grid is still below the viewport', () => {
    expect(rowWindow({ rows: 50, pitch: PITCH, top: 300, viewport: 500, overscan: 2 })).toEqual({
      first: 0,
      count: 4,
    });
  });

  it('stops at the last row rather than running past the data', () => {
    expect(rowWindow({ rows: 10, pitch: PITCH, top: -900, viewport: 500, overscan: 2 })).toEqual({
      first: 7,
      count: 3,
    });
  });

  it('mounts nothing when the grid is scrolled far above the viewport', () => {
    expect(rowWindow({ rows: 10, pitch: PITCH, top: 4000, viewport: 500, overscan: 2 })).toEqual({
      first: 0,
      count: 0,
    });
  });

  it('mounts nothing for an empty grid', () => {
    expect(rowWindow({ rows: 0, pitch: PITCH, top: 0, viewport: 500, overscan: 2 })).toEqual({
      first: 0,
      count: 0,
    });
  });

  it('mounts a single row rather than dividing by a pitch of zero', () => {
    expect(rowWindow({ rows: 50, pitch: 0, top: 0, viewport: 500, overscan: 2 })).toEqual({
      first: 0,
      count: 1,
    });
  });
});

describe('tileColumns', () => {
  it('fits two tiles across a phone-width row', () => {
    expect(tileColumns(420)).toBe(2);
  });

  it('caps the cell at the catalogue card width, so a wide row gains columns', () => {
    expect(tileColumns(1600)).toBe(7);
  });

  it('has no columns to give before the row has been measured', () => {
    expect(tileColumns(0)).toBe(0);
  });
});

describe('gridShape', () => {
  it('reserves the height its own rows add up to', () => {
    expect(gridShape(1046, 1045)).toEqual({
      columns: 4,
      cell: 248,
      pitch: 396,
      rows: 262,
      height: 103728,
    });
  });

  it('reserves nothing, and opens no window, before the row has been measured', () => {
    expect(gridShape(0, 1045)).toEqual({ columns: 0, cell: 0, pitch: 0, rows: 0, height: 0 });
    expect(rowWindow({ ...gridShape(0, 1045), top: 0, viewport: 900, overscan: 3 })).toEqual({
      first: 0,
      count: 0,
    });
  });

  it('reserves nothing for an empty library', () => {
    expect(gridShape(1046, 0)).toEqual({ columns: 0, cell: 0, pitch: 0, rows: 0, height: 0 });
  });
});
