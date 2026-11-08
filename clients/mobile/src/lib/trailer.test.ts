import { describe, expect, it } from 'vitest';
import { trailerHref, trailerRoute } from '#mobile/lib/trailer';

describe('the way to a trailer player', () => {
  it('names the title in the vocabulary TMDB files it under', () => {
    expect(trailerHref('tv', 1399, 'Game of Thrones')).toBe(
      '/trailer/tv/1399?title=Game%20of%20Thrones',
    );
  });

  it('carries a title that would otherwise break the query', () => {
    expect(trailerHref('movie', 1, 'Fast & Furious?')).toBe(
      '/trailer/movie/1?title=Fast%20%26%20Furious%3F',
    );
  });
});

describe('a trailer player route', () => {
  it('reads the title it was opened for', () => {
    expect(trailerRoute({ kind: 'movie', tmdbId: '1061474', title: 'Superman' })).toEqual({
      kind: 'movie',
      tmdbId: 1061474,
      title: 'Superman',
    });
  });

  it('opens without a title, which the player then takes from the trailer', () => {
    expect(trailerRoute({ kind: 'tv', tmdbId: '1399' })?.title).toBeNull();
  });

  it('refuses the catalog vocabulary, which is not the one TMDB files trailers under', () => {
    expect(trailerRoute({ kind: 'show', tmdbId: '1399' })).toBeNull();
  });

  it('refuses a path whose id was interpolated from nothing', () => {
    expect(trailerRoute({ kind: 'movie', tmdbId: 'undefined' })).toBeNull();
  });

  it('refuses an id that is not a whole positive number', () => {
    expect(trailerRoute({ kind: 'movie', tmdbId: '12.5' })).toBeNull();
  });
});
