import { describe, expect, it } from 'vitest';
import { nextSort, sortClaim } from './table-sort';

describe('sortClaim', () => {
  it('claims nothing on a platform with no sort semantics to claim it in', () => {
    expect(sortClaim('asc')).toEqual({});
  });
});

describe('nextSort', () => {
  it('walks one column ascending, then descending, then out of the sort', () => {
    const first = nextSort([], 'port', false);
    const second = nextSort(first, 'port', false);

    expect(first).toEqual([{ column: 'port', direction: 'asc' }]);
    expect(second).toEqual([{ column: 'port', direction: 'desc' }]);
    expect(nextSort(second, 'port', false)).toEqual([]);
  });

  it('appends a column as the last tiebreak when the table takes several', () => {
    const sort = nextSort([{ column: 'state', direction: 'asc' }], 'date', true);

    expect(sort).toEqual([
      { column: 'state', direction: 'asc' },
      { column: 'date', direction: 'asc' },
    ]);
  });

  it('turns a column already in the sort instead of sending it to the back', () => {
    const sort = [
      { column: 'state', direction: 'asc' },
      { column: 'date', direction: 'asc' },
    ] as const;

    expect(nextSort(sort, 'state', true)).toEqual([
      { column: 'state', direction: 'desc' },
      { column: 'date', direction: 'asc' },
    ]);
  });

  it('leaves the columns around it where they are when one drops out', () => {
    const sort = [
      { column: 'state', direction: 'desc' },
      { column: 'date', direction: 'desc' },
      { column: 'size', direction: 'asc' },
    ] as const;

    expect(nextSort(sort, 'date', true)).toEqual([
      { column: 'state', direction: 'desc' },
      { column: 'size', direction: 'asc' },
    ]);
  });
});
