import type { KromaClient, Translate, User } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { buildTitleView, type TitleInput, tmdbMetaLine } from './titleView';

// A translator that echoes the key, appending var values so we can assert
// interpolated labels deterministically.
const t: Translate = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${Object.values(vars).join(',')}` : key) as unknown as Translate;

// A fake client: only the art helpers buildTitleView calls are implemented.
const client = {
  posterFor: (m: { id: string }) => `poster:${m.id}`,
  backdropFor: (m: { id: string }) => (m.id === 'nobd' ? null : `bd:${m.id}`),
  showPosterFor: (s: { id: string }) => `spos:${s.id}`,
  themeFor: (s: { id: string }) => `theme:${s.id}`,
} as unknown as KromaClient;

const requester = { permissions: ['requests.create'] } as unknown as User;
const viewer = { permissions: ['playback'] } as unknown as User;

const build = (input: TitleInput, user: User | null = null) =>
  buildTitleView(client, t, user, input);

describe('buildTitleView: movie source', () => {
  const movieItem = {
    id: 'mv1',
    title: 'Dune',
    year: 2021,
    video: { codec: 'hevc' },
    metadata: {
      tmdbId: 438631,
      rating: 8.1,
      overview: 'ov',
      tagline: 'tl',
      genres: ['Sci-Fi', 'Adventure'],
      crew: [
        { job: 'Director', name: 'Denis' },
        { job: 'Writer', name: 'Jon' },
      ],
      cast: [{ name: 'Timothee' }],
    },
  };

  it('maps an owned movie with metadata + similar tiles', () => {
    const similar = [
      { id: 's-a', title: 'A', metadata: { genres: ['Action'] } },
      { id: 's-b', title: 'B', metadata: {} }, // no genre => content.film fallback
    ];
    const v = build({
      source: 'movie',
      item: movieItem as never,
      similar: similar as never,
      discover: { requestStatus: 'pending', requestProgress: 0.5 } as never,
    });
    expect(v.kind).toBe('movie');
    expect(v.tmdbId).toBe(438631);
    expect(v.localId).toBe('mv1');
    expect(v.inLibrary).toBe(true);
    expect(v.year).toBe(2021);
    expect(v.rating).toBe(8.1);
    expect(v.genres).toEqual(['Sci-Fi', 'Adventure']);
    expect(v.runtimeMin).toBeNull();
    expect(v.poster).toBe('poster:mv1');
    expect(v.backdrop).toBe('bd:mv1');
    expect(v.directors).toEqual(['Denis']); // Writer filtered out
    expect(v.themeUrl).toBeNull();
    expect(v.playable).toBe(movieItem);
    expect(v.playLabel).toBeNull();
    expect(v.seasons).toEqual([]);
    expect(v.requestStatus).toBe('pending');
    expect(v.requestProgress).toBe(0.5);
    expect(v.canRequest).toBe(false); // owned movie is never requestable
    expect(v.similar).toEqual([
      {
        key: 's-a',
        title: 'A',
        poster: 'poster:s-a',
        genre: 'Action',
        localId: 's-a',
        tmdbId: null,
        kind: 'movie',
      },
      {
        key: 's-b',
        title: 'B',
        poster: 'poster:s-b',
        genre: 'content.film',
        localId: 's-b',
        tmdbId: null,
        kind: 'movie',
      },
    ]);
  });

  it('coalesces a movie with no metadata and no discover overlay', () => {
    const bare = { id: 'nobd', title: 'Bare', video: null };
    const v = build({ source: 'movie', item: bare as never, similar: [], discover: null });
    expect(v.tmdbId).toBeNull();
    expect(v.rating).toBeNull();
    expect(v.overview).toBeNull();
    expect(v.genres).toEqual([]);
    expect(v.directors).toEqual([]);
    expect(v.cast).toEqual([]);
    expect(v.year).toBeNull();
    expect(v.backdrop).toBeNull(); // client returns null for id "nobd"
    expect(v.requestStatus).toBeNull();
    expect(v.requestProgress).toBeNull();
  });
});

describe('buildTitleView: show source', () => {
  const ep = (season: number | null, episode: number | null, id = `e${season}-${episode}`) => ({
    id,
    title: `Ep ${episode}`,
    season,
    episode,
    video: {},
    metadata: null,
  });

  const showObj = {
    id: 'sh1',
    title: 'Show',
    year: 2020,
    video: { codec: 'hevc' },
    seasonCount: 3,
    metadata: {
      tmdbId: 999,
      rating: 7,
      overview: 'o',
      tagline: 'tg',
      genres: ['Drama'],
      crew: [{ job: 'Creator', name: 'Vince' }],
      cast: [{ name: 'Bryan' }],
    },
  };

  const detail = {
    show: showObj,
    seasons: [{ number: 1, episodes: [ep(1, 1)], cast: [{ name: 'S1Actor' }] }],
  };

  it('uses the first episode as the play target when there is no up-next', () => {
    const v = build({
      source: 'show',
      detail: detail as never,
      similarShows: [{ id: 'sh2', title: 'Other', seasonCount: 2 } as never],
      upNext: null,
      discover: null,
    });
    expect(v.kind).toBe('show');
    expect(v.tmdbId).toBe(999);
    expect(v.poster).toBe('spos:sh1');
    expect(v.backdrop).toBe('bd:sh1');
    expect(v.themeUrl).toBe('theme:sh1');
    expect(v.directors).toEqual(['Vince']); // Creator counts as a director
    expect(v.playable).toEqual(ep(1, 1));
    expect(v.playLabel).toBe('player.playEpisode:1,1');
    expect(v.canRequest).toBe(false); // no discover overlay
    expect(v.seasons).toEqual([
      {
        number: 1,
        name: null,
        episodeCount: 1,
        episodesAvailable: 1,
        available: true,
        requested: false,
        airDate: null,
        episodes: [ep(1, 1)],
        cast: [{ name: 'S1Actor' }],
      },
    ]);
    expect(v.similar).toEqual([
      {
        key: 'sh2',
        title: 'Other',
        poster: 'spos:sh2',
        genre: 'content.seasonCount:2',
        localId: 'sh2',
        tmdbId: null,
        kind: 'show',
      },
    ]);
  });

  it('prefers the up-next item and uses the resume label when resuming', () => {
    const resumeEp = ep(2, 4, 'resume');
    const v = build({
      source: 'show',
      detail: detail as never,
      similarShows: [],
      upNext: { item: resumeEp, resume: true } as never,
      discover: null,
    });
    expect(v.playable).toBe(resumeEp);
    expect(v.playLabel).toBe('player.resumeEpisode:2,4');
  });

  it('yields a null play label when the target lacks season/episode numbers', () => {
    const noNums = { show: showObj, seasons: [{ number: 1, episodes: [ep(null, null)] }] };
    const v = build({
      source: 'show',
      detail: noNums as never,
      similarShows: [],
      upNext: null,
      discover: null,
    });
    expect(v.playLabel).toBeNull();
  });

  it('merges owned seasons with a TMDB availability overlay', () => {
    const discover = {
      requestStatus: 'approved',
      requestProgress: 0.25,
      seasons: [
        {
          season: 1,
          name: 'Season One',
          episodeCount: 10,
          episodesAvailable: 1,
          available: true,
          requested: false,
          airDate: '2020-01-01',
        },
        {
          season: 2,
          name: 'Season Two',
          episodeCount: 8,
          episodesAvailable: 0,
          available: false,
          requested: true,
          airDate: '2021-01-01',
        },
      ],
    };
    const v = build(
      {
        source: 'show',
        detail: detail as never,
        similarShows: [],
        upNext: null,
        discover: discover as never,
      },
      requester,
    );
    expect(v.canRequest).toBe(true); // tmdbId + discover + requests.create
    expect(v.requestStatus).toBe('approved');
    expect(v.seasons).toHaveLength(2);
    // Season 1: owned episodes kept, TMDB counts/name/airDate overlaid.
    expect(v.seasons[0]).toMatchObject({
      number: 1,
      name: 'Season One',
      episodeCount: 10,
      episodesAvailable: 1,
      available: true,
      airDate: '2020-01-01',
      episodes: [ep(1, 1)],
    });
    // Season 2: TMDB-only, not owned => no episodes, request-flagged.
    expect(v.seasons[1]).toMatchObject({
      number: 2,
      name: 'Season Two',
      available: false,
      requested: true,
      episodes: [],
      cast: [],
    });
  });

  it('coalesces a show with no metadata and nothing to play', () => {
    const bare = { show: { id: 'nobd', title: 'Bare Show' }, seasons: [] };
    const v = build({
      source: 'show',
      detail: bare as never,
      similarShows: [],
      upNext: null,
      discover: null,
    });
    expect(v.tmdbId).toBeNull();
    expect(v.year).toBeNull();
    expect(v.rating).toBeNull();
    expect(v.overview).toBeNull();
    expect(v.tagline).toBeNull();
    expect(v.genres).toEqual([]);
    expect(v.cast).toEqual([]);
    expect(v.directors).toEqual([]);
    expect(v.backdrop).toBeNull();
    expect(v.playable).toBeNull();
    expect(v.playLabel).toBeNull();
    expect(v.requestStatus).toBeNull();
    expect(v.requestProgress).toBeNull();
  });

  it('counts a TMDB season the overlay gave no counts for as zero', () => {
    const discover = { seasons: [{ season: 4, available: false }] };
    const v = build({
      source: 'show',
      detail: detail as never,
      similarShows: [],
      upNext: null,
      discover: discover as never,
    });
    expect(v.seasons[1]).toMatchObject({
      number: 4,
      episodeCount: 0,
      episodesAvailable: 0,
      episodes: [],
    });
  });

  it('does not grant canRequest to a user lacking requests.create', () => {
    const v = build(
      {
        source: 'show',
        detail: detail as never,
        similarShows: [],
        upNext: null,
        discover: { seasons: [] } as never,
      },
      viewer,
    );
    expect(v.canRequest).toBe(false);
  });
});

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
    expect(v.directors).toEqual(['Ava']);
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

describe('tmdbMetaLine', () => {
  it('joins year and formatted runtime with a middle dot', () => {
    expect(tmdbMetaLine(2024, 128)).toBe('2024 · 2h08');
  });

  it('omits runtime when it is zero/null', () => {
    expect(tmdbMetaLine(2024, 0)).toBe('2024');
    expect(tmdbMetaLine(2024, null)).toBe('2024');
  });

  it('shows only the runtime when the year is missing', () => {
    expect(tmdbMetaLine(null, 47)).toBe('47min');
  });

  it('is empty when both are missing', () => {
    expect(tmdbMetaLine(null, null)).toBe('');
    expect(tmdbMetaLine(0, 0)).toBe('');
  });
});
