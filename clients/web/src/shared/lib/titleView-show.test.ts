import { describe, expect, it } from 'vitest';
import { build, requester, viewer } from './titleView.fixture';

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
    expect(v.directors.map((d) => d.name)).toEqual(['Vince']); // Creator counts as a director
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
