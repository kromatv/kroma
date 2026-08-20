import { describe, expect, it } from 'vitest';
import { tmdbMetaLine } from './titleView';
import { build } from './titleView.fixture';

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
