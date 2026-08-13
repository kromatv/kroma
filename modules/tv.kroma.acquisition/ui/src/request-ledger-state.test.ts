import type { LedgerEpisode, LedgerSeason } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { episodeState, isRequested, seasonToOpen } from './request-ledger-state';

const TODAY = '2026-08-13';

function ep(episode: number, patch: Partial<LedgerEpisode> = {}): LedgerEpisode {
  return {
    season: 1,
    episode,
    name: `E${episode}`,
    overview: null,
    airDate: '2026-01-01',
    stillUrl: null,
    rating: null,
    onDisk: false,
    wantedId: `w${episode}`,
    wantedStatus: 'wanted',
    itemId: null,
    video: null,
    durationMs: null,
    ...patch,
  };
}

function season(patch: Partial<LedgerSeason> = {}): LedgerSeason {
  return {
    season: 1,
    name: 'Saison 1',
    airDate: null,
    episodeCount: 8,
    requested: 8,
    onDisk: 8,
    ...patch,
  };
}

describe('episodeState', () => {
  it('answers on disk before anything the ledger says', () => {
    expect(episodeState(ep(1, { onDisk: true, wantedStatus: 'grabbed' }), TODAY)).toBe('onDisk');
  });

  it('calls a queued download queued, not missing', () => {
    expect(episodeState(ep(1, { wantedStatus: 'grabbed' }), TODAY)).toBe('queued');
  });

  it('holds an episode that has not aired apart from a missing one', () => {
    expect(episodeState(ep(1, { airDate: '2026-12-01' }), TODAY)).toBe('unaired');
  });

  it('treats an undated episode as aired', () => {
    expect(episodeState(ep(1, { airDate: null }), TODAY)).toBe('missing');
  });

  it('separates an episode the request left out from one it wants', () => {
    expect(episodeState(ep(1, { wantedId: null, wantedStatus: null }), TODAY)).toBe('untracked');
    expect(episodeState(ep(1), TODAY)).toBe('missing');
  });
});

describe('seasonToOpen', () => {
  it('opens the first season the library is short of', () => {
    const seasons = [season(), season({ season: 2, onDisk: 3 }), season({ season: 3, onDisk: 0 })];
    expect(seasonToOpen(seasons)).toBe(2);
  });

  it('falls back to the first season when the title is complete', () => {
    expect(seasonToOpen([season({ season: 4 }), season({ season: 5 })])).toBe(4);
  });

  it('has nothing to open for a movie', () => {
    expect(seasonToOpen([])).toBeNull();
  });
});

describe('isRequested', () => {
  it('marks a season the request never covered', () => {
    expect(isRequested(season({ requested: 0 }))).toBe(false);
    expect(isRequested(season())).toBe(true);
  });
});
