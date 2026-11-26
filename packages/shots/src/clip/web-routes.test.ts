import { describe, expect, it } from 'vitest';
import { crawlSeeds, linkPath, pageKey, routeOf, unseenPages, webRoutes } from './web-routes';

const REPO = new URL('../../../..', import.meta.url).pathname;

const ROUTES = [
  '_app.index.tsx',
  '_app.movies.$id.tsx',
  '_app.movies.index.tsx',
  '_app.genres.$id.tsx',
  '_app._player.watch.$id.tsx',
  '_app.$.tsx',
  'admin.index.tsx',
  'admin.general.tsx',
  'admin.$.tsx',
  'admin.tsx',
  'login.tsx',
].map(routeOf);

describe('a route of the web client', () => {
  it('reads its path off its file name, a param as :param', () => {
    expect(routeOf('_app.movies.$id.tsx')).toEqual({
      segments: ['movies', ':param'],
      splat: false,
      nested: true,
      player: false,
    });
  });

  it('reads a layout index as the layout path and a lone $ as a splat', () => {
    expect(routeOf('admin.index.tsx').segments).toEqual(['admin']);
    expect(routeOf('admin.$.tsx')).toMatchObject({ segments: ['admin'], splat: true });
  });

  it('knows a route under the player layout plays something', () => {
    expect(routeOf('_app._player.watch.$id.tsx')).toMatchObject({
      segments: ['watch', ':param'],
      player: true,
    });
  });

  it('reads the routes folder of the web client, its tests left out', () => {
    const routes = webRoutes(REPO);

    expect(routes.map((route) => route.segments.join('/'))).toContain('admin/general');
    expect(routes.every((route) => !route.segments.some((name) => name.startsWith('-')))).toBe(
      true,
    );
  });
});

describe('where a crawl starts', () => {
  it('is every page under a layout that takes no param, each once', () => {
    expect(crawlSeeds(ROUTES)).toEqual(['/', '/admin', '/admin/general', '/movies']);
  });
});

describe('the pages a crawl visits', () => {
  it('lets one title stand for every title of its route', () => {
    expect(pageKey('/movies/abc', ROUTES)).toBe('/movies/:param');
    expect(pageKey('/movies/def', ROUTES)).toBe(pageKey('/movies/abc', ROUTES));
  });

  it('keeps every page a splat route serves apart', () => {
    expect(pageKey('/admin/tv.kroma.vpn', ROUTES)).toBe('/admin/tv.kroma.vpn');
  });

  it('prefers the route that names a segment over the one that takes it as a param', () => {
    expect(pageKey('/movies', ROUTES)).toBe('/movies');
  });

  it('never visits a page that plays something', () => {
    expect(pageKey('/watch/abc', ROUTES)).toBeNull();
  });

  it('takes each new page once, in order, and remembers it', () => {
    const seen = new Set(['/movies/:param']);

    const fresh = unseenPages(
      ['/genres/action', '/movies/abc', '/genres/drama', '/watch/x'],
      seen,
      ROUTES,
    );

    expect(fresh).toEqual(['/genres/action']);
    expect(seen.has('/genres/:param')).toBe(true);
  });
});

describe('the path of a link', () => {
  const origin = 'http://localhost:3200';

  it('is its path on the page origin, without its query', () => {
    expect(linkPath('/search?q=dune#top', origin)).toBe('/search');
  });

  it('is nothing for a link off the origin or into the API', () => {
    expect(linkPath('https://www.themoviedb.org/movie/1', origin)).toBeNull();
    expect(linkPath('/api/images/poster.jpg', origin)).toBeNull();
  });
});
