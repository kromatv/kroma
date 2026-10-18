import type { LibraryTitle } from '@kromatv/client/monitoring';
import { describe, expect, it } from 'vitest';
import { filterLibrary, heldRatio, type LibraryFilter, titleKey } from './monitoring-index-model';

const EVERY: LibraryFilter = {
  kind: 'all',
  state: 'all',
  needle: '',
  sort: 'title',
  descending: false,
};

function title(over: Partial<LibraryTitle> = {}): LibraryTitle {
  return {
    kind: 'show',
    tmdbId: 95396,
    localId: 'show-1',
    title: 'Severance',
    year: 2022,
    posterUrl: null,
    addedAt: '2026-01-01',
    onDisk: 4,
    seasonCount: 1,
    sizeBytes: 1024,
    monitored: true,
    monitoredUnits: 8,
    available: 4,
    missing: 4,
    grabbed: 0,
    airStatus: 'Returning Series',
    nextAirDate: null,
    ...over,
  };
}

describe('the library index filter', () => {
  it('keeps the titles nothing monitors when asked for them', () => {
    const rows = [title(), title({ title: 'Dune', monitored: false, missing: 0 })];

    const kept = filterLibrary(rows, { ...EVERY, state: 'unmonitored' });

    expect(kept.map((row) => row.title)).toEqual(['Dune']);
  });

  it('counts a show still airing as continuing', () => {
    const rows = [title(), title({ title: 'The Wire', airStatus: 'Ended' })];

    const kept = filterLibrary(rows, { ...EVERY, state: 'continuing' });

    expect(kept.map((row) => row.title)).toEqual(['Severance']);
  });

  it('orders by the column asked for and falls back to the title', () => {
    const rows = [
      title({ title: 'B', missing: 2 }),
      title({ title: 'A', missing: 2 }),
      title({ title: 'C', missing: 9 }),
    ];

    const kept = filterLibrary(rows, { ...EVERY, sort: 'missing', descending: true });

    expect(kept.map((row) => row.title)).toEqual(['C', 'A', 'B']);
  });

  it('matches a search however it is cased', () => {
    const rows = [title(), title({ title: 'Dune' })];

    const kept = filterLibrary(rows, { ...EVERY, needle: 'SEVER' });

    expect(kept.map((row) => row.title)).toEqual(['Severance']);
  });
});

describe('the held ratio', () => {
  it('is null for a title nothing monitors rather than zero', () => {
    expect(heldRatio(title({ monitored: false, monitoredUnits: 0 }))).toBeNull();
  });

  it('never passes one when more files are held than are monitored', () => {
    expect(heldRatio(title({ available: 12, monitoredUnits: 8 }))).toBe(1);
  });
});

describe('ordering the library index', () => {
  const rows = [
    title({ title: 'A', year: 2020, sizeBytes: 30, addedAt: '2026-03-01' }),
    title({ title: 'B', year: 2010, sizeBytes: 10, addedAt: '2026-01-01' }),
    title({ title: 'C', year: null, sizeBytes: 20, addedAt: null }),
  ];

  it.each([
    ['year', ['C', 'B', 'A']],
    ['size', ['B', 'C', 'A']],
    ['added', ['C', 'B', 'A']],
    ['title', ['A', 'B', 'C']],
  ] as const)('orders by %s, ascending', (sort, expected) => {
    const kept = filterLibrary(rows, { ...EVERY, sort });

    expect(kept.map((row) => row.title)).toEqual(expected);
  });
});

describe('a title key', () => {
  it('prefers the tmdb id, then the local id, then the title', () => {
    expect(titleKey(title())).toBe('show:95396');
    expect(titleKey(title({ tmdbId: null }))).toBe('show:show-1');
    expect(titleKey(title({ tmdbId: null, localId: null }))).toBe('show:Severance');
  });
});
