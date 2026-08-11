import { describe, expect, it } from 'vitest';
import { cellWidth, columnsFor } from './grid';

describe('columnsFor', () => {
  it('fits as many cells as the room allows', () => {
    expect(columnsFor(1000, 260, 24)).toBe(3);
    expect(columnsFor(1920, 260, 24)).toBe(6);
  });

  it('counts the gaps between cells, not after the last one', () => {
    expect(columnsFor(284, 260, 24)).toBe(1);
    expect(columnsFor(544, 260, 24)).toBe(2);
  });

  it('keeps one column when the room is narrower than a single cell', () => {
    expect(columnsFor(200, 260, 24)).toBe(1);
    expect(columnsFor(0, 260, 24)).toBe(1);
  });

  it('never divides by a cell of no width', () => {
    expect(columnsFor(1000, 0, 24)).toBe(1);
  });
});

describe('an auto-filled cell', () => {
  it('never produces a cell narrower than the minimum asked for', () => {
    const gap = 24;
    for (const min of [160, 220, 260, 320]) {
      for (let room = min; room <= 2400; room += 37) {
        const cell = cellWidth(room, columnsFor(room, min, gap), gap);
        expect(cell).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('never overflows the room it was given', () => {
    const gap = 24;
    for (let room = 300; room <= 2400; room += 41) {
      const columns = columnsFor(room, 260, gap);
      const used = cellWidth(room, columns, gap) * columns + gap * (columns - 1);
      expect(used).toBeLessThanOrEqual(room);
    }
  });
});
