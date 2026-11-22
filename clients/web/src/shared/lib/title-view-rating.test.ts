import { describe, expect, it } from 'vitest';
import { mediaItem } from './cast.fixture';
import { build } from './title-view.fixture';

const metadata = {
  provider: 'tmdb',
  tmdbId: 603,
  title: 'The Matrix',
  overview: null,
  genres: [],
  tmdbUrl: 'https://www.themoviedb.org/movie/603',
};

describe('buildTitleView: age rating', () => {
  it('carries the age rating the reader is shown', () => {
    const rating = { label: 'R', country: 'US', borrowed: true };
    const item = mediaItem({ metadata: { ...metadata, ageRating: rating } });

    const view = build({ source: 'movie', item, similar: [], discover: null });

    expect(view.ageRating).toEqual(rating);
  });

  it('carries none for a title nobody rated', () => {
    const view = build({
      source: 'movie',
      item: mediaItem({ metadata }),
      similar: [],
      discover: null,
    });

    expect(view.ageRating).toBeNull();
  });
});
