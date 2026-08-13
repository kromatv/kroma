import { describe, expect, it } from 'vitest';
import {
  canSearch,
  defaultTarget,
  needsEpisode,
  needsSeason,
  queryPreview,
  scopeOf,
} from './free-search-target';

describe('defaultTarget', () => {
  it('opens a film request on films and a show on a season', () => {
    expect(defaultTarget('movie')).toBe('movie');
    expect(defaultTarget('show')).toBe('season');
  });
});

describe('what each target asks for', () => {
  it('wants no number for a film', () => {
    expect(needsSeason('movie')).toBe(false);
    expect(needsEpisode('movie')).toBe(false);
  });

  it('wants a season for a season, and both for an episode', () => {
    expect(needsSeason('season')).toBe(true);
    expect(needsEpisode('season')).toBe(false);
    expect(needsSeason('episode')).toBe(true);
    expect(needsEpisode('episode')).toBe(true);
  });
});

describe('scopeOf', () => {
  it('drops numbers the target does not ask for, however they were left', () => {
    expect(scopeOf('movie', '2', '5')).toEqual({ season: null, episode: null });
    expect(scopeOf('season', '2', '5')).toEqual({ season: 2, episode: null });
    expect(scopeOf('episode', '2', '5')).toEqual({ season: 2, episode: 5 });
  });

  it('keeps season 0, which is the specials', () => {
    expect(scopeOf('season', '0', '')).toEqual({ season: 0, episode: null });
  });

  it('reads an empty or nonsense box as no number', () => {
    expect(scopeOf('season', '', '')).toEqual({ season: null, episode: null });
    expect(scopeOf('season', 'abc', '')).toEqual({ season: null, episode: null });
    expect(scopeOf('season', '-3', '')).toEqual({ season: null, episode: null });
  });
});

describe('queryPreview', () => {
  it('shows the text alone for a film', () => {
    expect(queryPreview('Heat', 'movie', '', '')).toBe('Heat');
  });

  it('tags the season, and the episode when there is one', () => {
    expect(queryPreview('Alien: Earth', 'season', '1', '')).toBe('Alien: Earth S01');
    expect(queryPreview('Alien: Earth', 'episode', '1', '6')).toBe('Alien: Earth S01E06');
  });

  it('says nothing at all until something is typed', () => {
    expect(queryPreview('   ', 'season', '1', '')).toBe('');
  });
});

describe('canSearch', () => {
  it('needs text', () => {
    expect(canSearch('', 'movie', '', '')).toBe(false);
    expect(canSearch('Heat', 'movie', '', '')).toBe(true);
  });

  it('refuses a season search with no season, which is a film search mislabelled', () => {
    expect(canSearch('Alien: Earth', 'season', '', '')).toBe(false);
    expect(canSearch('Alien: Earth', 'season', '1', '')).toBe(true);
  });

  it('refuses an episode search missing either number', () => {
    expect(canSearch('Alien: Earth', 'episode', '1', '')).toBe(false);
    expect(canSearch('Alien: Earth', 'episode', '', '6')).toBe(false);
    expect(canSearch('Alien: Earth', 'episode', '1', '6')).toBe(true);
  });
});
