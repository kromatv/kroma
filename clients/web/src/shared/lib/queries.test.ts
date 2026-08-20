import { describe, expect, it, vi } from 'vitest';
import { c, installHarness, run } from './queries.fixture';

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => c,
  toMovieView: (_c: unknown, m: { id: string }) => ({ ...m, mapped: 'movie' }),
  toShowView: (_c: unknown, s: { id: string }) => ({ ...s, mapped: 'show' }),
}));

const { catalogQueries, discoverQueries, serverQueries, userQueries } = await import(
  '#web/shared/lib/queries'
);

installHarness();

describe('the cache keys', () => {
  it('are stable across calls, so a loader and a component share one entry', () => {
    expect(catalogQueries.moviesView().queryKey).toEqual(catalogQueries.moviesView().queryKey);
    expect(catalogQueries.item('m1').queryKey).toEqual(catalogQueries.item('m1').queryKey);
    expect(userQueries.notifications().queryKey).toEqual(userQueries.notifications().queryKey);
  });

  it('separate the queries that would otherwise collide', () => {
    expect(catalogQueries.movies().queryKey).not.toEqual(catalogQueries.moviesView().queryKey);
    expect(catalogQueries.shows().queryKey).not.toEqual(catalogQueries.showsView().queryKey);
    expect(userQueries.notifications().queryKey).not.toEqual(
      userQueries.notificationPrefs().queryKey,
    );
  });

  it('carry their arguments, so two ids are two entries', () => {
    expect(catalogQueries.item('a').queryKey).not.toEqual(catalogQueries.item('b').queryKey);
    expect(catalogQueries.showBundle('a').queryKey).not.toEqual(
      catalogQueries.showBundle('b').queryKey,
    );
    expect(discoverQueries.trending('movie', 1).queryKey).not.toEqual(
      discoverQueries.trending('movie', 2).queryKey,
    );
    expect(discoverQueries.detail('movie', 603).queryKey).not.toEqual(
      discoverQueries.detail('tv', 603).queryKey,
    );
  });

  it('nest the show bundle under its show, so one invalidate drops both', () => {
    const bundle = catalogQueries.showBundle('s1').queryKey;
    expect(bundle.slice(0, 2)).toEqual(catalogQueries.show('s1').queryKey);
  });

  it('gives the rarely-moving reads a stale time so they are not refetched per page', () => {
    expect(serverQueries.health().staleTime).toBeGreaterThan(0);
    expect(catalogQueries.personDetails('x').staleTime).toBeGreaterThan(0);
  });
});

describe('the catalogue views', () => {
  it('map every row through the view mapper', async () => {
    c.movies.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    const out = await run(catalogQueries.moviesView());
    expect(out).toEqual([
      { id: 'm1', mapped: 'movie' },
      { id: 'm2', mapped: 'movie' },
    ]);

    c.shows.mockResolvedValue([{ id: 's1' }]);
    expect(await run(catalogQueries.showsView())).toEqual([{ id: 's1', mapped: 'show' }]);
  });

  it('hands the raw lists back unmapped where the ids are all that is needed', async () => {
    c.movies.mockResolvedValue([{ id: 'm1' }]);
    expect(await run(catalogQueries.movies())).toEqual([{ id: 'm1' }]);
  });
});

describe('the featured hero', () => {
  it('resolves a movie hero through the movie mapper', async () => {
    c.featured.mockResolvedValue({ type: 'movie', item: { id: 'm1' } });
    expect(await run(catalogQueries.featured())).toEqual({
      type: 'movie',
      movie: { id: 'm1', mapped: 'movie' },
    });
  });

  it('resolves a show hero through the show mapper', async () => {
    c.featured.mockResolvedValue({ type: 'show', show: { id: 's1' } });
    expect(await run(catalogQueries.featured())).toEqual({
      type: 'show',
      show: { id: 's1', mapped: 'show' },
    });
  });

  it('is null rather than an error when the server has no hero for it', async () => {
    c.featured.mockRejectedValue(new Error('404'));
    expect(await run(catalogQueries.featured())).toBeNull();

    c.featured.mockResolvedValue(null);
    expect(await run(catalogQueries.featured())).toBeNull();
  });
});

describe('the plain reads', () => {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous by design
  const cases: [string, () => any, string, unknown?][] = [
    ['catalog.item', () => catalogQueries.item('m1'), 'item'],
    ['catalog.show', () => catalogQueries.show('s1'), 'show'],
    ['catalog.shows', () => catalogQueries.shows(), 'shows'],
    ['catalog.similar', () => catalogQueries.similar('m1'), 'similar'],
    ['catalog.personCredits', () => catalogQueries.personCredits('Ana'), 'personCredits'],
    ['catalog.personDetails', () => catalogQueries.personDetails('Ana'), 'personDetails'],
    ['catalog.upNext', () => catalogQueries.upNext('s1'), 'upNext'],
    ['user.home', () => userQueries.home(), 'home'],
    ['user.continueWatching', () => userQueries.continueWatching(), 'continueWatching'],
    ['user.progress', () => userQueries.progress(), 'progress'],
    ['user.myRequests', () => userQueries.myRequests(), 'listRequests', { mine: true }],
    ['user.calendar', () => userQueries.calendar(), 'getCalendar', { mine: true }],
    ['user.missing', () => userQueries.missing(), 'getMissing', { mine: true }],
    ['user.sessions', () => userQueries.sessions(), 'listSessions'],
    ['user.passkeys', () => userQueries.passkeys(), 'listPasskeys'],
    ['user.notifications', () => userQueries.notifications(), 'listNotifications'],
    ['user.notificationPrefs', () => userQueries.notificationPrefs(), 'getNotificationPrefs'],
    ['user.pushKey', () => userQueries.pushKey(), 'pushKey'],
    ['server.health', () => serverQueries.health(), 'health'],
    ['server.splash', () => serverQueries.splash(), 'splash'],
    ['discover.detail', () => discoverQueries.detail('movie', 603), 'discoverDetail'],
    [
      'discover.trending',
      () => discoverQueries.trending('movie', 2),
      'discoverTrending',
      { type: 'movie', page: 2 },
    ],
  ];

  function spy(method: string) {
    const fn = c[method];
    if (!fn) throw new Error(`the fake client has no ${method}()`);
    return fn;
  }

  it.each(cases)('%s calls %s', async (_name, build, method, arg) => {
    spy(method).mockResolvedValue('payload');
    await run(build());
    expect(spy(method)).toHaveBeenCalledTimes(1);
    if (arg !== undefined) expect(spy(method)).toHaveBeenCalledWith(arg);
  });

  it("asks the three request lists for the caller's own rows only", () => {
    for (const build of [userQueries.myRequests, userQueries.calendar, userQueries.missing]) {
      expect(build().queryKey[0]).toBe('requests');
    }
  });
});
