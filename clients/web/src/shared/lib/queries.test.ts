import { ItemId, ShowId } from '@kroma/client/media';
import { describe, expect, it, type Mock, vi } from 'vitest';
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
    expect(catalogQueries.item(ItemId.parse('m1')).queryKey).toEqual(
      catalogQueries.item(ItemId.parse('m1')).queryKey,
    );
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
    expect(catalogQueries.item(ItemId.parse('a')).queryKey).not.toEqual(
      catalogQueries.item(ItemId.parse('b')).queryKey,
    );
    expect(catalogQueries.showBundle(ShowId.parse('a')).queryKey).not.toEqual(
      catalogQueries.showBundle(ShowId.parse('b')).queryKey,
    );
    expect(discoverQueries.trending('movie', 1).queryKey).not.toEqual(
      discoverQueries.trending('movie', 2).queryKey,
    );
    expect(discoverQueries.detail('movie', 603).queryKey).not.toEqual(
      discoverQueries.detail('tv', 603).queryKey,
    );
  });

  it('nest the show bundle under its show, so one invalidate drops both', () => {
    const bundle = catalogQueries.showBundle(ShowId.parse('s1')).queryKey;
    expect(bundle.slice(0, -1)).toEqual(catalogQueries.show(ShowId.parse('s1')).queryKey);
  });

  it('gives the rarely-moving reads a stale time so they are not refetched per page', () => {
    expect(serverQueries.health().staleTime).toBeGreaterThan(0);
    expect(catalogQueries.personDetails('x').staleTime).toBeGreaterThan(0);
  });
});

describe('the catalogue views', () => {
  it('map every row through the view mapper', async () => {
    c.media.movies.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    const out = await run(catalogQueries.moviesView());
    expect(out).toEqual([
      { id: 'm1', mapped: 'movie' },
      { id: 'm2', mapped: 'movie' },
    ]);

    c.media.shows.mockResolvedValue([{ id: 's1' }]);
    expect(await run(catalogQueries.showsView())).toEqual([{ id: 's1', mapped: 'show' }]);
  });

  it('hands the raw lists back unmapped where the ids are all that is needed', async () => {
    c.media.movies.mockResolvedValue([{ id: 'm1' }]);
    expect(await run(catalogQueries.movies())).toEqual([{ id: 'm1' }]);
  });
});

describe('the featured hero', () => {
  it('resolves a movie hero through the movie mapper', async () => {
    c.media.featured.mockResolvedValue({ type: 'movie', item: { id: 'm1' } });
    expect(await run(catalogQueries.featured())).toEqual({
      type: 'movie',
      movie: { id: 'm1', mapped: 'movie' },
    });
  });

  it('resolves a show hero through the show mapper', async () => {
    c.media.featured.mockResolvedValue({ type: 'show', show: { id: 's1' } });
    expect(await run(catalogQueries.featured())).toEqual({
      type: 'show',
      show: { id: 's1', mapped: 'show' },
    });
  });

  it('is null rather than an error when the server has no hero for it', async () => {
    c.media.featured.mockRejectedValue(new Error('404'));
    expect(await run(catalogQueries.featured())).toBeNull();

    c.media.featured.mockResolvedValue(null);
    expect(await run(catalogQueries.featured())).toBeNull();
  });
});

describe('the plain reads', () => {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous by design
  const cases: [string, () => any, Mock, unknown?][] = [
    ['catalog.item', () => catalogQueries.item(ItemId.parse('m1')), c.media.item],
    ['catalog.show', () => catalogQueries.show(ShowId.parse('s1')), c.media.show],
    ['catalog.shows', () => catalogQueries.shows(), c.media.shows],
    ['catalog.similar', () => catalogQueries.similar(ItemId.parse('m1')), c.media.similar],
    ['catalog.personCredits', () => catalogQueries.personCredits('Ana'), c.media.people],
    ['catalog.personDetails', () => catalogQueries.personDetails('Ana'), c.media.person],
    ['catalog.upNext', () => catalogQueries.upNext(ShowId.parse('s1')), c.playback.upNext],
    ['user.home', () => userQueries.home(), c.media.home],
    ['user.continueWatching', () => userQueries.continueWatching(), c.playback.continueWatching],
    ['user.progress', () => userQueries.progress(), c.playback.progress],
    ['user.myRequests', () => userQueries.myRequests(), c.requests.list, { mine: true }],
    ['user.calendar', () => userQueries.calendar(), c.requests.calendar, { mine: true }],
    ['user.missing', () => userQueries.missing(), c.requests.missing, { mine: true }],
    ['user.sessions', () => userQueries.sessions(), c.accounts.sessions],
    ['user.passkeys', () => userQueries.passkeys(), c.accounts.passkeys.list],
    ['user.notifications', () => userQueries.notifications(), c.notifications.list],
    ['user.notificationPrefs', () => userQueries.notificationPrefs(), c.notifications.prefs],
    ['user.pushKey', () => userQueries.pushKey(), c.notifications.push.key],
    ['server.health', () => serverQueries.health(), c.media.health],
    ['server.splash', () => serverQueries.splash(), c.media.splash],
    ['discover.detail', () => discoverQueries.detail('movie', 603), c.discovery.detail],
    [
      'discover.trending',
      () => discoverQueries.trending('movie', 2),
      c.discovery.trending,
      { type: 'movie', page: 2 },
    ],
  ];

  it.each(cases)('%s reaches the endpoint it names', async (_name, build, endpoint, arg) => {
    endpoint.mockResolvedValue('payload');
    await run(build());
    expect(endpoint).toHaveBeenCalledTimes(1);
    if (arg !== undefined) expect(endpoint).toHaveBeenCalledWith(arg);
  });
});

describe('the caller’s own request lists', () => {
  it('are three distinct cache entries, each asking only for its own rows', () => {
    const builds = [userQueries.myRequests, userQueries.calendar, userQueries.missing];

    const keys = builds.map((build) => JSON.stringify(build().queryKey));

    expect(new Set(keys).size).toBe(3);
    for (const build of builds) expect(build().queryKey).toContain('requests');
  });
});
