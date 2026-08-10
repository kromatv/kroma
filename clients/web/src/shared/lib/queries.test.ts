// A route loader (`ensureQueryData`) and the component rendering the same data
// (`useSuspenseQuery`) only share a cache entry if they agree on the key, and nothing in the
// type system enforces that. A drifted key does not fail; it silently refetches on every
// navigation. The fetchers are pinned too: several decide what a page does when part of it is
// unavailable, and getting that wrong turns an optional overlay into an error boundary.
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Client {
  [k: string]: ReturnType<typeof vi.fn>;
  movies: ReturnType<typeof vi.fn>;
  shows: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  item: ReturnType<typeof vi.fn>;
  featured: ReturnType<typeof vi.fn>;
  similar: ReturnType<typeof vi.fn>;
  upNext: ReturnType<typeof vi.fn>;
  discoverDetail: ReturnType<typeof vi.fn>;
  personDetails: ReturnType<typeof vi.fn>;
  followingEpisodes: ReturnType<typeof vi.fn>;
}

const c: Client = {
  movies: vi.fn(),
  shows: vi.fn(),
  show: vi.fn(),
  item: vi.fn(),
  featured: vi.fn(),
  similar: vi.fn(),
  upNext: vi.fn(),
  discoverDetail: vi.fn(),
  personDetails: vi.fn(),
  followingEpisodes: vi.fn(),
  personCredits: vi.fn(),
  home: vi.fn(),
  continueWatching: vi.fn(),
  progress: vi.fn(),
  listRequests: vi.fn(),
  getCalendar: vi.fn(),
  getMissing: vi.fn(),
  listSessions: vi.fn(),
  listPasskeys: vi.fn(),
  listNotifications: vi.fn(),
  getNotificationPrefs: vi.fn(),
  pushKey: vi.fn(),
  health: vi.fn(),
  splash: vi.fn(),
  discoverTrending: vi.fn(),
};

// The view mappers are tagged rather than stubbed away, so a test can tell
// "went through the mapper" from "handed back the raw row".
vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => c,
  toMovieView: (_c: unknown, m: { id: string }) => ({ ...m, mapped: 'movie' }),
  toShowView: (_c: unknown, s: { id: string }) => ({ ...s, mapped: 'show' }),
}));

const { catalogQueries, discoverQueries, serverQueries, userQueries } = await import(
  '#web/shared/lib/queries'
);

// biome-ignore lint/suspicious/noExplicitAny: the options are heterogeneous by design
async function run(opts: any) {
  return await opts.queryFn({});
}

function show(id: string, genres: string[] = [], tmdbId: number | null = null) {
  return { id, metadata: { genres, tmdbId } };
}

beforeEach(() => {
  for (const fn of Object.values(c)) fn.mockReset();
  c.shows.mockResolvedValue([]);
  c.upNext.mockResolvedValue(null);
  c.discoverDetail.mockResolvedValue(null);
  c.followingEpisodes.mockResolvedValue([]);
});

describe('the cache keys', () => {
  it('are stable across calls, so a loader and a component share one entry', () => {
    // Every key is rebuilt on each call. If any of them closed over something
    // per-call, the loader's prefetch would land in a different entry than the
    // component's read and every navigation would refetch.
    expect(catalogQueries.moviesView().queryKey).toEqual(catalogQueries.moviesView().queryKey);
    expect(catalogQueries.item('m1').queryKey).toEqual(catalogQueries.item('m1').queryKey);
    expect(userQueries.notifications().queryKey).toEqual(userQueries.notifications().queryKey);
  });

  it('separate the queries that would otherwise collide', () => {
    // `movies` and `moviesView` fetch the same rows but hold DIFFERENT shapes;
    // sharing a key would hand raw rows to a component expecting resolved art.
    expect(catalogQueries.movies().queryKey).not.toEqual(catalogQueries.moviesView().queryKey);
    expect(catalogQueries.shows().queryKey).not.toEqual(catalogQueries.showsView().queryKey);
    // The inbox and its preference matrix are both "notifications".
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
    // `invalidateQueries({ queryKey: ['show', id] })` after an edit has to reach
    // the bundle too, and react-query matches by key PREFIX.
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
    // A raw row here would reach the card with an unresolved poster URL.
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
    // An older server 404s this endpoint and an empty catalogue has no hero.
    // Throwing would take down the whole home page for a decorative banner.
    c.featured.mockRejectedValue(new Error('404'));
    expect(await run(catalogQueries.featured())).toBeNull();

    c.featured.mockResolvedValue(null);
    expect(await run(catalogQueries.featured())).toBeNull();
  });
});

describe('the show bundle', () => {
  const detail = (id: string, genres: string[], tmdbId: number | null = null) => ({
    show: show(id, genres, tmdbId),
  });

  it('prefers shows that share a genre', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([
      show('s1', ['Drama']),
      show('a', ['Drama']),
      show('b', ['Drama']),
      show('c', ['Drama']),
      show('z', ['Comedy']),
    ]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a show, and a catalogue, with no metadata at all', async () => {
    c.show.mockResolvedValue({ show: { id: 's1' } });
    c.shows.mockResolvedValue([{ id: 's1' }, { id: 'a' }, { id: 'b' }]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).toEqual(['a', 'b']);
  });

  it('never suggests the show you are already looking at', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([show('s1', ['Drama']), show('a', ['Drama'])]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).not.toContain('s1');
  });

  it('falls back to the rest of the catalogue rather than showing one lonely card', async () => {
    // Fewer than three genre matches reads as an empty rail; a small library
    // would show nothing at all on most shows.
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([
      show('s1', ['Drama']),
      show('a', ['Drama']),
      show('x', ['Comedy']),
      show('y', ['Horror']),
    ]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).toEqual(['a', 'x', 'y']);
  });

  it('caps the rail so a big library does not render hundreds of cards', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([
      show('s1', ['Drama']),
      ...Array.from({ length: 30 }, (_, i) => show(`o${i}`, ['Drama'])),
    ]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows).toHaveLength(12);
  });

  it('skips the discover overlay entirely for a show TMDB never matched', async () => {
    // Asking with a null id would be a guaranteed-failing round trip on every
    // un-enriched show in the library.
    c.show.mockResolvedValue(detail('s1', [], null));

    const { discover } = await run(catalogQueries.showBundle('s1'));
    expect(discover).toBeNull();
    expect(c.discoverDetail).not.toHaveBeenCalled();
  });

  it('asks for the overlay by the show tmdb id when there is one', async () => {
    c.show.mockResolvedValue(detail('s1', [], 1396));
    c.discoverDetail.mockResolvedValue({ seasons: [] });

    const { discover } = await run(catalogQueries.showBundle('s1'));
    expect(c.discoverDetail).toHaveBeenCalledWith('tv', 1396);
    expect(discover).toEqual({ seasons: [] });
  });

  it('still renders the page for a viewer who may not request', async () => {
    // The server 403s discover before any TMDB call for an account without
    // `requests.create`. The overlay is optional; the page is not.
    c.show.mockResolvedValue(detail('s1', [], 1396));
    c.discoverDetail.mockRejectedValue(new Error('403'));
    c.upNext.mockRejectedValue(new Error('403'));

    const bundle = await run(catalogQueries.showBundle('s1'));
    expect(bundle.discover).toBeNull();
    expect(bundle.upNext).toBeNull();
    expect(bundle.detail).toBeTruthy();
  });
});

describe('the optional lookups', () => {
  it('treat a missing similar list as no suggestions', async () => {
    c.similar.mockRejectedValue(new Error('boom'));
    expect(await run(catalogQueries.similar('m1'))).toEqual([]);
  });

  it('keep the credit name when the person profile cannot be fetched', async () => {
    // The page renders the name and the credits either way; an empty envelope
    // keeps the shape the component destructures.
    c.personDetails.mockRejectedValue(new Error('boom'));
    expect(await run(catalogQueries.personDetails('Greta Gerwig'))).toEqual({
      name: 'Greta Gerwig',
      person: null,
    });
  });
});

describe('the watch payload', () => {
  it('carries the item mapped, plus the episode autoplay will roll to', async () => {
    c.item.mockResolvedValue({ id: 'e1' });
    c.followingEpisodes.mockResolvedValue([{ id: 'e2' }, { id: 'e3' }]);

    const out = await run(catalogQueries.watch('e1'));
    expect(out.item).toEqual({ id: 'e1', mapped: 'movie' });
    expect(out.next).toEqual({ id: 'e2' });
    expect(out.following).toHaveLength(2);
  });

  it('has no next episode at the end of a show', async () => {
    // `undefined` here would make the autoplay countdown appear with nothing to
    // play; the player checks for null.
    c.item.mockResolvedValue({ id: 'e9' });
    c.followingEpisodes.mockResolvedValue([]);

    const out = await run(catalogQueries.watch('e9'));
    expect(out.next).toBeNull();
    expect(out.following).toEqual([]);
  });
});

describe('the plain reads', () => {
  // Each is one line joining a key to an endpoint, and nothing else checks that
  // the pairing is right: the wrong call here fills the correct cache entry with
  // the wrong page's data.
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

  // Fails loudly if the fake client has no such method, which would otherwise
  // make the case below pass vacuously.
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
    // `mine: true` is what separates "my requests" from the moderator queue.
    // Dropping it would show every account's requests on a personal page.
    for (const build of [userQueries.myRequests, userQueries.calendar, userQueries.missing]) {
      expect(build().queryKey[0]).toBe('requests');
    }
  });
});
