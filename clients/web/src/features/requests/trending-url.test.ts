import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { openTrendingFilms, requireTrendingKind, validateTrendingSearch } from './trending-url';

function redirectOf(go: () => void) {
  try {
    go();
  } catch (thrown) {
    return isRedirect(thrown) ? thrown.options : null;
  }
  return null;
}

describe('validateTrendingSearch', () => {
  it('keeps a page past the first', () => {
    expect(validateTrendingSearch({ page: 3 })).toEqual({ page: 3 });
  });

  it('leaves the first page out of the url', () => {
    expect(validateTrendingSearch({ page: 1 })).toEqual({});
  });

  it('drops a page that is not a whole number past the first', () => {
    for (const page of [0, -2, 2.5, '2', null, {}, [2]]) {
      expect(validateTrendingSearch({ page })).toEqual({});
    }
  });

  it('drops what it does not know', () => {
    expect(validateTrendingSearch({ page: 2, sort: 'added' })).toEqual({ page: 2 });
  });
});

describe('requireTrendingKind', () => {
  it('lets the films and the shows through', () => {
    for (const type of ['movie', 'tv']) {
      expect(redirectOf(() => requireTrendingKind({ params: { type } }))).toBeNull();
    }
  });

  it('sends any other kind to the search', () => {
    const sent = redirectOf(() => requireTrendingKind({ params: { type: 'music' } }));

    expect(sent).toMatchObject({ to: '/search', search: { q: '', type: 'all' } });
  });
});

describe('openTrendingFilms', () => {
  it('sends the bare trending url to the films, in place of itself', () => {
    const sent = redirectOf(openTrendingFilms);

    expect(sent).toMatchObject({ to: '/trending/$type', params: { type: 'movie' }, replace: true });
  });
});
