import { describe, expect, it } from 'vitest';
import { build, requester } from './titleView.fixture';

describe('buildTitleView: discover source (not owned)', () => {
  const baseDetail = {
    kind: 'movie' as const,
    tmdbId: 777,
    localId: null,
    inLibrary: false,
    title: 'Discover Movie',
    year: 2019,
    rating: 6.4,
    overview: 'ov',
    tagline: 'tag',
    genres: ['Thriller'],
    runtimeMin: 120,
    posterUrl: '/api/p.jpg',
    backdropUrl: 'https://cdn/bd.jpg',
    crew: [{ job: 'Director', name: 'Ava' }],
    cast: [{ name: 'Lead' }],
    seasons: [
      {
        season: 1,
        name: 'S1',
        episodeCount: 6,
        episodesAvailable: 0,
        available: false,
        requested: false,
        airDate: '2019-05-01',
      },
    ],
    requestStatus: null,
    requestProgress: null,
    similar: [
      {
        inLibrary: true,
        localId: 'loc1',
        tmdbId: 11,
        title: 'Owned',
        posterUrl: '/api/o.jpg',
        kind: 'movie',
      },
      {
        inLibrary: false,
        localId: null,
        tmdbId: 22,
        title: 'Foreign',
        posterUrl: null,
        kind: 'show',
      },
    ],
  };

  it('resolves image URLs and maps seasons/similar with a requester', () => {
    const v = build({ source: 'discover', detail: baseDetail as never }, requester);
    expect(v.kind).toBe('movie');
    expect(v.inLibrary).toBe(false);
    expect(v.runtimeMin).toBe(120);
    // Relative art is resolved against the API base; absolute passes through.
    expect(v.poster).toBe('http://localhost:4040/api/p.jpg');
    expect(v.backdrop).toBe('https://cdn/bd.jpg');
    expect(v.directors.map((d) => d.name)).toEqual(['Ava']);
    expect(v.video).toBeNull();
    expect(v.playable).toBeNull();
    expect(v.canRequest).toBe(true);
    expect(v.seasons).toEqual([
      {
        number: 1,
        name: 'S1',
        episodeCount: 6,
        episodesAvailable: 0,
        available: false,
        requested: false,
        airDate: '2019-05-01',
        episodes: [],
        cast: [],
      },
    ]);
    expect(v.similar).toEqual([
      {
        key: 'loc1', // owned + localId => local key
        title: 'Owned',
        poster: 'http://localhost:4040/api/o.jpg',
        genre: 'discover.kindMovie',
        localId: 'loc1',
        tmdbId: 11,
        kind: 'movie',
      },
      {
        key: 'tmdb:22', // not owned => tmdb key; null poster => ''
        title: 'Foreign',
        poster: '',
        genre: 'discover.kindShow',
        localId: null,
        tmdbId: 22,
        kind: 'show',
      },
    ]);
  });

  it('has an empty poster and no canRequest when posterUrl/tmdbId are absent', () => {
    const detail = { ...baseDetail, posterUrl: null, backdropUrl: null, tmdbId: null };
    const v = build({ source: 'discover', detail: detail as never }, requester);
    expect(v.poster).toBe('');
    expect(v.backdrop).toBeNull();
    expect(v.canRequest).toBe(false); // no tmdbId
  });

  it('denies canRequest to an anonymous viewer', () => {
    const v = build({ source: 'discover', detail: baseDetail as never }, null);
    expect(v.canRequest).toBe(false);
  });
});
