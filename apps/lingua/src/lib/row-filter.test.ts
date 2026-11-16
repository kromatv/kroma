import { describe, expect, it } from 'vitest';
import type { RowView } from '#site/lib/views';
import { isUntranslated, matchesRowFilter } from './row-filter';

function row(over: Partial<RowView> = {}): RowView {
  return {
    key: 'title',
    source: 'Title',
    references: [],
    current: null,
    draft: null,
    proposed: false,
    plural: null,
    issues: [],
    ...over,
  };
}

describe('matchesRowFilter', () => {
  it('keeps every row under all', () => {
    expect(matchesRowFilter(row({ current: 'Titre' }), 'all')).toBe(true);
  });

  it('keeps a message with neither a translation nor an edit under missing', () => {
    expect(matchesRowFilter(row(), 'missing')).toBe(true);
  });

  it('drops a message the viewer already drafted from missing', () => {
    expect(matchesRowFilter(row({ draft: 'Titre' }), 'missing')).toBe(false);
  });

  it('keeps only the messages holding the viewer edit under mine', () => {
    expect(
      [row({ current: 'Titre' }), row({ draft: 'Titre' })].map((r) => matchesRowFilter(r, 'mine')),
    ).toEqual([false, true]);
  });
});

describe('isUntranslated', () => {
  it('treats a translation of only spaces as missing', () => {
    expect(isUntranslated(row({ current: '  ' }))).toBe(true);
  });
});
