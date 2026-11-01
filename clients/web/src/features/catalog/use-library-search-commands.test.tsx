// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef } from '#web/shared/lib/command-menu';
import { useLibrarySearchCommands } from './use-library-search-commands';

const mocks = vi.hoisted(() => ({
  commands: [] as readonly CommandDef[],
  query: '',
  watched: [] as string[],
  listed: [] as string[],
  search: vi.fn(),
  toggleWatched: vi.fn(),
  toggleList: vi.fn(),
}));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      media: {
        search: mocks.search,
        artwork: { posterFor: () => 'item-poster', showPosterFor: () => 'show-poster' },
      },
    },
  }),
}));
vi.mock('#web/shared/lib/watched', () => ({
  useWatched: () => ({
    isWatched: (id: string) => mocks.watched.includes(id),
    toggleWatched: mocks.toggleWatched,
  }),
}));
vi.mock('#web/shared/lib/mylist', () => ({
  useMyList: () => ({
    inList: (id: string) => mocks.listed.includes(id),
    toggle: mocks.toggleList,
  }),
}));
vi.mock('#web/shared/lib/command-menu', () => ({
  useCommandQuery: () => mocks.query,
  useCommands: (commands: readonly (CommandDef | false | null | undefined | '')[]) => {
    mocks.commands = commands.filter((row): row is CommandDef => Boolean(row));
  },
}));

const MOVIE = {
  type: 'movie',
  item: { id: 'm1', kind: 'movie', title: 'Dune', year: 2021, durationMs: 9_960_000 },
};
const SHOW = { type: 'show', show: { id: 's1', title: 'Dark', year: 2017, seasonCount: 3 } };
const EPISODE = {
  type: 'episode',
  item: {
    id: 'e1',
    kind: 'episode',
    title: 'Fichier',
    episodeTitle: 'Secrets',
    showId: 's1',
    showTitle: 'Dark',
    season: 1,
    episode: 2,
  },
};

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function typing(query: string, ...results: unknown[]) {
  mocks.query = query;
  mocks.search.mockResolvedValue({ results });
  renderHook(() => useLibrarySearchCommands(), { wrapper });
  await waitFor(() => expect(mocks.search).toHaveBeenCalled());
  await waitFor(() => expect(titles()).toHaveLength(results.length));
}

const titles = () => mocks.commands.filter((row) => row.group === 'commands.groupTitles');
const wayOut = () => mocks.commands.find((row) => row.to === '/search');

beforeEach(() => {
  mocks.commands = [];
  mocks.watched = [];
  mocks.listed = [];
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('useLibrarySearchCommands', () => {
  it('offers nothing before anything is typed', () => {
    mocks.query = '';

    renderHook(() => useLibrarySearchCommands(), { wrapper });

    expect(mocks.commands).toEqual([]);
  });

  it('does not ask the server about a single letter', async () => {
    mocks.query = 'd';

    renderHook(() => useLibrarySearchCommands(), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('asks the library for a handful of titles once the query holds still', async () => {
    await typing('dune', MOVIE);

    expect(mocks.search).toHaveBeenCalledWith('dune', { limit: 6 });
  });

  it('opens a movie on its own page', async () => {
    await typing('dune', MOVIE);

    expect(titles()[0]).toMatchObject({
      label: 'Dune',
      to: '/movies/$id',
      params: { id: 'm1' },
    });
  });

  it('says a movie is a movie, its year and how long it runs', async () => {
    await typing('dune', MOVIE);

    expect(titles()[0]).toMatchObject({
      image: 'item-poster',
      subtitle: 'content.film · 2021 · 2h46',
    });
  });

  it('says a show is a show, its year and how many seasons it has', async () => {
    await typing('dark', SHOW);

    expect(titles()[0]).toMatchObject({
      image: 'show-poster',
      subtitle: 'content.series · 2017 · content.seasonCount',
    });
  });

  it('takes a show’s year from its release date when it has no year of its own', async () => {
    const undated = {
      type: 'show',
      show: { ...SHOW.show, year: null, metadata: { releaseDate: '2005-03-24' } },
    };

    await typing('office', undated);

    expect(titles()[0]?.subtitle).toContain('2005');
  });

  it('names an episode by its own title, then its show and its number', async () => {
    await typing('secrets', EPISODE);

    expect(titles()[0]).toMatchObject({ label: 'Secrets', subtitle: 'Dark · S01E02' });
  });

  it('leaves out a runtime too short to print as anything but zero', async () => {
    const clip = { type: 'movie', item: { ...MOVIE.item, durationMs: 12_000 } };

    await typing('dune', clip);

    expect(titles()[0]?.subtitle).toBe('content.film · 2021');
  });

  it('leaves out what it does not know rather than a gap', async () => {
    const bare = { type: 'movie', item: { id: 'm3', kind: 'video', title: 'Holiday', year: null } };

    await typing('holiday', bare);

    expect(titles()[0]?.subtitle).toBe('');
  });

  it('says a title was already watched', async () => {
    mocks.watched = ['m1'];

    await typing('dune', MOVIE);

    expect(titles()[0]?.meta).toBe('content.watched');
  });

  it('says nothing of a title not watched yet', async () => {
    await typing('dune', MOVIE);

    expect(titles()[0]?.meta).toBeUndefined();
  });

  it('opens a show on its own page', async () => {
    await typing('dark', SHOW);

    expect(titles()[0]).toMatchObject({ label: 'Dark', to: '/shows/$id', params: { id: 's1' } });
  });

  it('opens an episode on its show, and says which show it belongs to', async () => {
    await typing('secrets', EPISODE);

    expect(titles()[0]).toMatchObject({ to: '/shows/$id', params: { id: 's1' } });
  });

  it('opens an episode’s show on that episode’s season', async () => {
    await typing('secrets', EPISODE);

    expect(titles()[0]).toMatchObject({ search: { season: 1 }, hash: 'episodes' });
  });

  it('opens an episode with no show on its own page', async () => {
    await typing('pilote', { type: 'episode', item: { id: 'e2', title: 'Pilote' } });

    expect(titles()[0]).toMatchObject({ to: '/movies/$id', params: { id: 'e2' } });
  });

  it('gives each title an id of its own, since two can share a route', async () => {
    await typing('du', MOVIE, { type: 'movie', item: { id: 'm2', title: 'Dune' } });

    expect(new Set(titles().map((row) => row.id)).size).toBe(2);
  });

  it('keeps every hit when none is named what was typed, as it found them in a cast', async () => {
    await typing('tom hardy', MOVIE, SHOW);

    expect(titles().map((row) => row.always)).toEqual([true, true]);
  });

  it('leaves every hit to match once one is named what was typed', async () => {
    await typing('dun', MOVIE, SHOW);

    expect(titles().map((row) => row.always)).toEqual([false, false]);
  });

  it('counts a typo the menu forgives as being named what was typed', async () => {
    await typing('dnue', MOVIE, SHOW);

    expect(titles()[1]?.always).toBe(false);
  });

  const actionLabels = () => titles()[0]?.actions?.map((one) => one && one.label);

  it('lets a movie be played, listed and marked as watched', async () => {
    await typing('dune', MOVIE);

    expect(actionLabels()).toEqual(['content.play', 'content.addToList', 'content.markWatched']);
  });

  it('lets a show be listed and marked as watched, having nothing to play yet', async () => {
    await typing('dark', SHOW);

    expect(actionLabels()).toEqual(['content.addToList', 'content.markWatched']);
  });

  it('lets an episode be played and marked as watched', async () => {
    await typing('secrets', EPISODE);

    expect(actionLabels()).toEqual(['content.play', 'content.markWatched']);
  });

  it('says a movie opens on its details', async () => {
    await typing('dune', MOVIE);

    expect(titles()[0]?.primaryLabel).toBe('commands.actionOpenTitle');
  });

  it('says a show opens on its details', async () => {
    await typing('dark', SHOW);

    expect(titles()[0]?.primaryLabel).toBe('commands.actionOpenTitle');
  });

  it('says an episode opens on its show, which is where it goes', async () => {
    await typing('secrets', EPISODE);

    expect(titles()[0]?.primaryLabel).toBe('commands.actionOpenShow');
  });

  it('says an episode with no show opens on its details', async () => {
    await typing('pilote', { type: 'episode', item: { id: 'e2', title: 'Pilote' } });

    expect(titles()[0]?.primaryLabel).toBe('commands.actionOpenTitle');
  });

  it('says the search page shows the results', () => {
    mocks.query = 'inception';

    renderHook(() => useLibrarySearchCommands(), { wrapper });

    expect(wayOut()?.primaryLabel).toBe('commands.actionSeeResults');
  });

  it('plays a title on the player', async () => {
    await typing('dune', MOVIE);

    expect(titles()[0]?.actions?.[0]).toMatchObject({ to: '/watch/$id', params: { id: 'm1' } });
  });

  it('offers to take a title off the list when it is on it', async () => {
    mocks.listed = ['m1'];

    await typing('dune', MOVIE);

    expect(actionLabels()).toContain('content.removeFromList');
  });

  it('offers to unmark a title already watched', async () => {
    mocks.watched = ['m1'];

    await typing('dune', MOVIE);

    expect(actionLabels()).toContain('content.markUnwatched');
  });

  it('adds a title to the list when asked', async () => {
    await typing('dune', MOVIE);
    const add = titles()[0]?.actions?.[1];

    if (add && 'run' in add) await add.run?.();

    expect(mocks.toggleList).toHaveBeenCalledWith('m1');
  });

  it('offers the search page on exactly what is typed', () => {
    mocks.query = '  inception ';

    renderHook(() => useLibrarySearchCommands(), { wrapper });

    expect(wayOut()).toMatchObject({
      meta: 'inception',
      always: true,
      search: { q: 'inception', type: 'all' },
    });
  });
});
