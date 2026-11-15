// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchRequests } from '#tv/app/searchRequest';
import type { SearchShellProps } from '#tv/app/searchShell';
import { addRecentSearch } from '#tv/features/catalog/searchHistory';
import {
  clearPressGuard,
  found,
  known,
  mount,
  movie,
  series,
  tmdb,
  tmdbInLibrary,
  type,
} from '#tv/features/catalog/TvSearch.fixtures';

// jsdom leaves `localStorage` undefined under this runner, and the device store
// falls back to no storage at all; the recent searches need one.
const cells = new Map<string, string>();
const deviceStore = {
  getItem: (key: string) => cells.get(key) ?? null,
  setItem: (key: string, value: string) => void cells.set(key, value),
};

beforeEach(() => {
  cells.clear();
  vi.stubGlobal('localStorage', deviceStore);
  // The router mirrors its stack to sessionStorage under a dev build, which the
  // runner is; without this each mount resumes the previous test's stack.
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  inputHost.clearPressGuard();
  vi.unstubAllGlobals();
});

describe('TvSearch', () => {
  it('asks the server for the query once the typing settles', async () => {
    const { search } = mount();
    type('D');
    type('U');
    await waitFor(() => expect(search).toHaveBeenCalledWith('du'));
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('opens a film the server found, and remembers the search that reached it', async () => {
    const { nav } = mount({
      search: vi.fn(async () => found({ type: 'movie', item: movie('m1', 'Blade Runner') })),
    });
    type('B');

    fireEvent.click(await screen.findByRole('button', { name: 'Blade Runner' }));
    expect(nav().route.name).toBe('movie');
    // The query counts as a search only now, so the list holds real searches
    // rather than every typing prefix.
    expect(screen.getByRole('button', { name: 'b' })).toBeTruthy();
  });

  it('remembers the search that found the result, not the prefix typed after it', async () => {
    const { search } = mount({
      search: vi.fn(async () => found({ type: 'movie', item: movie('m1', 'Blade Runner') })),
    });
    type('B');
    const hit = await screen.findByRole('button', { name: 'Blade Runner' });
    type('X');

    fireEvent.click(hit);
    expect(screen.getByRole('button', { name: 'b' })).toBeTruthy();
    await waitFor(() => expect(search).toHaveBeenCalledWith('bx'));
    expect(screen.queryByRole('button', { name: 'bx' })).toBeNull();
  });

  it('opens a series the server found', async () => {
    const { nav } = mount({
      search: vi.fn(async () => found({ type: 'show', show: series('s1', 'Severance') })),
    });
    type('S');

    fireEvent.click(await screen.findByRole('button', { name: 'Severance' }));
    expect(nav().route.name).toBe('show');
  });

  it('falls back to the catalogue already loaded when the server cannot answer', async () => {
    mount({
      search: vi.fn(async () => {
        throw new Error('offline');
      }),
      movies: [movie('m1', 'Dune'), movie('m2', 'Arrival')],
      shows: [series('s1', 'Andor', 'dune-adjacent')],
    });
    type('D');

    expect(await screen.findByRole('button', { name: 'Dune' })).toBeTruthy();
    // Genres match too, which is how the series lands on a query naming none.
    expect(screen.getByRole('button', { name: 'Andor' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Arrival' })).toBeNull();
  });

  it('runs a saved search again from its pill', async () => {
    addRecentSearch('dune');
    const { search } = mount();

    fireEvent.click(screen.getByRole('button', { name: 'dune' }));
    await waitFor(() => expect(search).toHaveBeenCalledWith('dune'));
  });

  it('offers no microphone on a television that cannot hear', () => {
    mount();
    expect(screen.queryByLabelText('Voice search')).toBeNull();
  });

  it('listens once the microphone is pressed', () => {
    mount({ voiceSearch: { available: () => true, Session: () => null } });

    fireEvent.click(screen.getByLabelText('Voice search'));
    expect(screen.getByText('Speak now…')).toBeTruthy();
  });

  it('opens already listening when the remote asked for it, and again when asked while open', () => {
    const requests = createSearchRequests();
    requests.requestListening();
    mount({ voiceSearch: { available: () => true, Session: () => null }, requests });

    expect(screen.getByText('Speak now…')).toBeTruthy();
    expect(requests.takePendingListen()).toBe(false);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Speak now…')).toBeNull();
    act(() => requests.requestListening());
    expect(screen.getByText('Speak now…')).toBeTruthy();
  });

  it('hands the whole screen to the platform’s own chrome where there is one', () => {
    const searchShell = {
      available: () => true,
      Shell: ({ placeholder, children }: SearchShellProps) => (
        <>
          <span>{`shell:${placeholder}`}</span>
          {children({ width: 900, height: 600 })}
        </>
      ),
    };
    mount({ searchShell });

    expect(screen.getByText('shell:Search')).toBeTruthy();
    // Ours is gone with it: the platform draws its own field and keys.
    expect(screen.queryByLabelText('A')).toBeNull();
  });

  it('opens the titles of somebody the query names, above the library results', async () => {
    const { nav } = mount({
      search: vi.fn(async () => ({
        ...found({ type: 'movie', item: movie('m1', 'Blade Runner') }),
        people: [{ name: 'Ridley Scott', titles: 3 }],
      })),
    });
    type('R');

    const person = await screen.findByRole('button', { name: 'See titles with Ridley Scott' });
    const film = screen.getByRole('button', { name: 'Blade Runner' });
    fireEvent.click(person);

    expect(screen.getByText('3 titles')).toBeTruthy();
    expect(person.compareDocumentPosition(film)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(nav().route).toEqual({ name: 'person', params: { name: 'Ridley Scott' } });
  });

  it('shows the people a query names even when no title matches it', async () => {
    mount({
      search: vi.fn(async () => ({ ...found(), people: [{ name: 'Ridley Scott', titles: 1 }] })),
    });
    type('R');

    expect(await screen.findByText('Ridley Scott')).toBeTruthy();
    expect(screen.getByText('1 title')).toBeTruthy();
    expect(screen.queryByText('No results')).toBeNull();
  });

  it('offers a title TMDB knows and this server has not got', async () => {
    const { nav } = mount({ discover: vi.fn(async () => known(tmdb(45_745, 'Sintel'))) });
    type('S');

    fireEvent.click(await screen.findByRole('button', { name: 'Sintel' }));
    expect(nav().route.name).toBe('discover');
    expect(screen.getByText('Discover')).toBeTruthy();
  });

  it('leaves a title the library already holds out of the half that is not in it', async () => {
    mount({
      search: vi.fn(async () => found({ type: 'movie', item: movie('m1', 'Sintel') })),
      discover: vi.fn(async () => known(tmdbInLibrary(45_745, 'Sintel'))),
    });
    type('S');

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Sintel' })).toHaveLength(1));
    expect(screen.queryByText('Discover')).toBeNull();
  });

  it('opens on a query asked for from outside the app, and re-targets a second one', async () => {
    const requests = createSearchRequests();
    requests.requestSearch('alien');
    const { search } = mount({ requests });
    await waitFor(() => expect(search).toHaveBeenCalledWith('alien'));

    act(() => {
      requests.requestSearch('aliens');
    });
    await waitFor(() => expect(search).toHaveBeenCalledWith('aliens'));
  });
});
