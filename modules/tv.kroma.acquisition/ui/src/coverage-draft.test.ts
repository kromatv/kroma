import type { LedgerEpisode, LedgerSeason, RequestCoverage } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  type CoverageDraft,
  coveredCount,
  covers,
  draftOf,
  isEmpty,
  keyOf,
  seasonCoverage,
  toBody,
  toggleEpisode,
  toggleSeason,
} from './coverage-draft';

function season(n: number, episodeCount = 3): LedgerSeason {
  return { season: n, name: null, airDate: null, episodeCount, requested: 0, onDisk: 0 };
}

function episode(s: number, e: number): LedgerEpisode {
  return {
    season: s,
    episode: e,
    name: null,
    overview: null,
    airDate: null,
    stillUrl: null,
    rating: null,
    onDisk: false,
    wantedId: null,
    wantedStatus: null,
    itemId: null,
    video: null,
    durationMs: null,
  };
}

function request(patch: Partial<RequestCoverage>): RequestCoverage {
  return { seasons: null, episodes: null, ...patch };
}

const ALL = [season(1), season(2), season(3)];
const S1 = [episode(1, 1), episode(1, 2), episode(1, 3)];

const draft = (seasons: number[], episodes: string[]): CoverageDraft => ({
  seasons: new Set(seasons),
  episodes: new Set(episodes),
});

describe('draftOf', () => {
  it('opens a whole-show request with every season ticked', () => {
    expect([...draftOf(request({}), ALL).seasons]).toEqual([1, 2, 3]);
  });

  it('opens a season-scoped request on just those seasons', () => {
    expect([...draftOf(request({ seasons: [2] }), ALL).seasons]).toEqual([2]);
  });

  it('opens an episode-scoped request on just those episodes', () => {
    const d = draftOf(request({ episodes: [{ season: 1, episode: 2 }] }), ALL);
    expect([...d.seasons]).toEqual([]);
    expect([...d.episodes]).toEqual(['1:2']);
  });
});

describe('covers', () => {
  it('covers an episode through its whole season or on its own', () => {
    expect(covers(draft([1], []), 1, 9)).toBe(true);
    expect(covers(draft([], ['2:5']), 2, 5)).toBe(true);
    expect(covers(draft([], ['2:5']), 2, 6)).toBe(false);
  });
});

describe('seasonCoverage', () => {
  it('is all for a whole season, whatever its rows say', () => {
    expect(seasonCoverage(draft([1], []), 1, null)).toBe('all');
  });

  it('is some for a partial pick, and all once every row is picked', () => {
    expect(seasonCoverage(draft([], ['1:1']), 1, S1)).toBe('some');
    expect(seasonCoverage(draft([], ['1:1', '1:2', '1:3']), 1, S1)).toBe('all');
  });

  it('never claims all without the rows to know it', () => {
    expect(seasonCoverage(draft([], ['1:1']), 1, null)).toBe('some');
  });

  it('is none when nothing in it is picked', () => {
    expect(seasonCoverage(draft([2], []), 1, S1)).toBe('none');
  });
});

describe('toggleSeason', () => {
  it('taking a season whole drops the episodes picked inside it', () => {
    const d = toggleSeason(draft([], ['1:1', '2:4']), 1, true);
    expect([...d.seasons]).toEqual([1]);
    expect([...d.episodes]).toEqual(['2:4']);
  });

  it('dropping a season clears it entirely', () => {
    const d = toggleSeason(draft([1, 2], ['1:1']), 1, false);
    expect([...d.seasons]).toEqual([2]);
    expect([...d.episodes]).toEqual([]);
  });
});

describe('toggleEpisode', () => {
  it('unticking one inside a whole season breaks the season into the rest', () => {
    const d = toggleEpisode(draft([1], []), 1, 2, S1);
    expect([...d.seasons]).toEqual([]);
    expect([...d.episodes].sort()).toEqual(['1:1', '1:3']);
  });

  it('adds and removes a single episode', () => {
    const added = toggleEpisode(draft([], []), 1, 2, S1);
    expect([...added.episodes]).toEqual(['1:2']);
    expect([...toggleEpisode(added, 1, 2, S1).episodes]).toEqual([]);
  });
});

describe('coveredCount', () => {
  it('counts a whole season by what TMDB says it holds', () => {
    expect(coveredCount(draft([1], ['2:4']), ALL)).toBe(4);
  });
});

describe('toBody', () => {
  it('says the whole show when every season is taken whole', () => {
    expect(toBody(draft([1, 2, 3], []), ALL)).toEqual({ seasons: null, episodes: null });
  });

  it('lists seasons and episodes apart, each sorted', () => {
    expect(toBody(draft([3, 1], ['2:5', '2:1']), ALL)).toEqual({
      seasons: [1, 3],
      episodes: [
        { season: 2, episode: 1 },
        { season: 2, episode: 5 },
      ],
    });
  });

  it('does not call a full set of seasons the whole show when an episode is picked too', () => {
    const body = toBody(draft([1, 2, 3], ['4:1']), ALL);
    expect(body.seasons).toEqual([1, 2, 3]);
    expect(body.episodes).toEqual([{ season: 4, episode: 1 }]);
  });
});

describe('isEmpty', () => {
  it('is empty only with nothing picked at all', () => {
    expect(isEmpty(draft([], []))).toBe(true);
    expect(isEmpty(draft([], [keyOf(1, 1)]))).toBe(false);
  });
});
