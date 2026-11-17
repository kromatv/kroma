import { describe, expect, it } from 'vitest';
import { messageFilters, sectionFilters, shownFilters } from './filter-choices';

describe('filter choices', () => {
  it('name each filter and carry its count', () => {
    const counts = { all: 9, missing: 2, outdated: 0, unreviewed: 1, mine: 0 };

    expect(messageFilters(counts).map((c) => [c.value, c.label, c.count])).toEqual([
      ['all', 'All', 9],
      ['missing', 'Missing', 2],
      ['outdated', 'Outdated', 0],
      ['unreviewed', 'Unreviewed', 1],
      ['mine', 'My edits', 0],
    ]);
    expect(sectionFilters({ ...counts, incomplete: 3 }).map((c) => c.value)).toEqual([
      'all',
      'incomplete',
      'outdated',
      'unreviewed',
      'mine',
    ]);
  });

  it('keep the first, the one in force, and those listing something', () => {
    const counts = { all: 9, missing: 2, outdated: 0, unreviewed: 0, mine: 0 };

    expect(shownFilters(messageFilters(counts), 'mine').map((c) => c.value)).toEqual([
      'all',
      'missing',
      'mine',
    ]);
  });
});
