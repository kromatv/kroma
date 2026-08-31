import { describe, expect, it } from 'vitest';
import {
  historyOrderedBy,
  historyRequest,
  historySort,
  validateHistorySearch,
} from './history-query';

describe("the watch history's address", () => {
  it('asks for everything the log holds when no window is named', () => {
    expect(historyRequest(validateHistorySearch({})).days).toBe(0);
  });

  it('applies the library, the account and the window it arrived with', () => {
    const search = validateHistorySearch({ library: 'lib-1', user: 'u-7', range: '7d' });

    expect(historyRequest(search)).toMatchObject({ library: 'lib-1', user: 'u-7', days: 7 });
  });

  it('drops a window nobody offers', () => {
    expect(validateHistorySearch({ range: 'fortnight' }).range).toBeUndefined();
  });

  it('drops a column the table cannot order by', () => {
    expect(validateHistorySearch({ sort: 'network', dir: 'asc' }).sort).toBeUndefined();
  });

  it('leaves the first page out of the address', () => {
    expect(validateHistorySearch({ page: 1 }).page).toBeUndefined();
  });

  it('names the column and the direction the server orders by', () => {
    expect(historyRequest(validateHistorySearch({ sort: 'title', dir: 'asc' })).sort).toBe(
      'title:asc',
    );
  });

  it('reads most recent first until a column is picked', () => {
    expect(historyRequest({}).sort).toBe('endedAt:desc');
  });

  it('turns a page number into the offset of its first row', () => {
    expect(historyRequest({ page: 3 })).toMatchObject({ limit: 50, offset: 100 });
  });

  it('narrows to one title without dropping the other filters', () => {
    const search = validateHistorySearch({ item: 'show-4', user: 'u-7' });

    expect(historyRequest(search)).toMatchObject({ item: 'show-4', user: 'u-7' });
  });
});

describe("the table's order", () => {
  it('says the newest is first until a column is picked', () => {
    expect(historySort({})).toEqual([{ column: 'endedAt', direction: 'desc' }]);
  });

  it('says the column and the direction the address arrived with', () => {
    expect(historySort({ sort: 'title', dir: 'asc' })).toEqual([
      { column: 'title', direction: 'asc' },
    ]);
  });

  it('writes a pressed heading into the address and returns to the first page', () => {
    const search = historyOrderedBy({ item: 'dune', page: 4 }, [
      { column: 'username', direction: 'asc' },
    ]);

    expect(search).toEqual({ item: 'dune', page: 1, sort: 'username', dir: 'asc' });
  });

  it('leaves the default order out of the address rather than spelling it', () => {
    const search = historyOrderedBy({ sort: 'title', dir: 'asc' }, []);

    expect(historySort(search)).toEqual([{ column: 'endedAt', direction: 'desc' }]);
    expect(search.sort).toBeUndefined();
  });

  it('ignores a column the table cannot order by', () => {
    const search = historyOrderedBy({}, [{ column: 'watchedMs', direction: 'asc' }]);

    expect(search.sort).toBeUndefined();
  });
});
