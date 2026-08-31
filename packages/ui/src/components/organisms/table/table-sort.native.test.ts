import { describe, expect, it } from 'vitest';
import { nextSort, sortClaim } from './table-sort';

const ONE = { multiple: false, required: false };
const STACKED = { multiple: true, required: false };
const KEPT = { multiple: false, required: true };

describe('sortClaim', () => {
  it('claims nothing on a platform with no sort semantics to claim it in', () => {
    expect(sortClaim('asc')).toEqual({});
  });
});

describe('nextSort', () => {
  it('walks one column ascending, then descending, then out of the sort', () => {
    const first = nextSort([], 'port', ONE);
    const second = nextSort(first, 'port', ONE);

    expect(first).toEqual([{ column: 'port', direction: 'asc' }]);
    expect(second).toEqual([{ column: 'port', direction: 'desc' }]);
    expect(nextSort(second, 'port', ONE)).toEqual([]);
  });

  it('turns the last column around rather than leaving the rows unordered', () => {
    const sort = nextSort([{ column: 'port', direction: 'desc' }], 'port', KEPT);

    expect(sort).toEqual([{ column: 'port', direction: 'asc' }]);
  });

  it('still drops a stacked column while another one is left to order by', () => {
    const sort = [
      { column: 'state', direction: 'desc' },
      { column: 'date', direction: 'desc' },
    ] as const;

    expect(nextSort(sort, 'date', { multiple: true, required: true })).toEqual([
      { column: 'state', direction: 'desc' },
    ]);
  });

  it('appends a column as the last tiebreak when the table takes several', () => {
    const sort = nextSort([{ column: 'state', direction: 'asc' }], 'date', STACKED);

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

    expect(nextSort(sort, 'state', STACKED)).toEqual([
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

    expect(nextSort(sort, 'date', STACKED)).toEqual([
      { column: 'state', direction: 'desc' },
      { column: 'size', direction: 'asc' },
    ]);
  });
});
