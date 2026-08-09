import { type CalendarEntry, RequestId } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { epKey, groupByTitle } from './missing-model';

const req = (id: string) => RequestId.of(id);

function entry(over: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    requestId: null,
    tmdbId: 1399,
    kind: 'show',
    title: 'Le Trône de fer',
    year: 2011,
    posterUrl: null,
    season: 1,
    episode: 2,
    airDate: null,
    status: 'missing',
    ...over,
  };
}

describe('epKey', () => {
  it('keys a requested row on its request', () => {
    expect(epKey(entry({ requestId: req('req_7') }))).toBe('req_7:1:2');
  });

  it('falls back to the tmdb id for a scan gap nobody requested', () => {
    // Two different shows can both be at season 1 episode 2, so the id has to
    // be in the key or their rows would share a selection.
    expect(epKey(entry())).toBe('tmdb:1399:1:2');
    expect(epKey(entry({ tmdbId: 66732 }))).toBe('tmdb:66732:1:2');
  });

  it('reads a film, which has no season or episode, as zero', () => {
    expect(epKey(entry({ kind: 'movie', season: null, episode: null }))).toBe('tmdb:1399:0:0');
  });

  it('separates every row of one season', () => {
    const rows = [1, 2, 3].map((episode) => epKey(entry({ episode })));
    expect(new Set(rows).size).toBe(3);
  });
});

describe('groupByTitle', () => {
  it('gathers the entries of one title under one group, in arrival order', () => {
    const groups = groupByTitle([
      entry({ requestId: req('req_1'), episode: 1 }),
      entry({ requestId: req('req_2'), tmdbId: 66732, title: 'Stranger Things', episode: 1 }),
      entry({ requestId: req('req_1'), episode: 2 }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['Le Trône de fer', 'Stranger Things']);
    expect(groups[0]?.items.map((e) => e.episode)).toEqual([1, 2]);
    expect(groups[1]?.items).toHaveLength(1);
  });

  it('keeps the order the server sent rather than sorting', () => {
    // The server already ranks these; re-sorting here would silently override it.
    const groups = groupByTitle([
      entry({ tmdbId: 3, title: 'Zoulou' }),
      entry({ tmdbId: 1, title: 'Alpha' }),
      entry({ tmdbId: 2, title: 'Milieu' }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['Zoulou', 'Alpha', 'Milieu']);
  });

  it('splits two unrequested titles that only differ by tmdb id', () => {
    const groups = groupByTitle([
      entry({ tmdbId: 1, title: 'Le Bureau' }),
      entry({ tmdbId: 2, title: 'The Office' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('keeps a requested and an unrequested row of the same show apart', () => {
    // They are different rows to the page: one can be retried, the other cannot.
    const groups = groupByTitle([entry({ requestId: req('req_1') }), entry({ requestId: null })]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.requestId).toBe('req_1');
    expect(groups[1]?.requestId).toBeNull();
  });

  it('carries the title fields off the first entry of each group', () => {
    const [group] = groupByTitle([
      entry({ requestId: req('req_1'), year: 2011, posterUrl: '/api/images/a' }),
      entry({ requestId: req('req_1'), year: 1999, posterUrl: '/api/images/b', episode: 3 }),
    ]);
    expect(group).toMatchObject({ year: 2011, posterUrl: '/api/images/a', kind: 'show' });
  });

  it('answers an empty list with no groups', () => {
    expect(groupByTitle([])).toEqual([]);
  });
});
