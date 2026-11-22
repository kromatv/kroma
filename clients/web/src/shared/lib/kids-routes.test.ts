import { describe, expect, it } from 'vitest';
import { keptFromKids } from './kids-routes';

describe('the pages a Kids session never opens', () => {
  it('holds account settings, pairing, discovery and requests', () => {
    for (const page of [
      '/account',
      '/connect',
      '/requests',
      '/discover/movie/603',
      '/trending/tv',
    ]) {
      expect(keptFromKids(page)).toBe(true);
    }
  });

  it('leaves the catalogue, search and the player open', () => {
    for (const page of ['/', '/movies', '/shows/abc', '/search', '/my-list', '/watch/abc']) {
      expect(keptFromKids(page)).toBe(false);
    }
  });

  it('matches a whole segment, never a page that only starts with the same letters', () => {
    expect(keptFromKids('/accounts-help')).toBe(false);
  });
});
