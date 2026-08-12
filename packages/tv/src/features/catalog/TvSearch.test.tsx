// @vitest-environment jsdom

import type { KromaClient, MediaItem, SearchResponse, Show } from '@kroma/core';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import { EnvProvider } from '#tv/app/providers/env';
import {
  TvClientProvider,
  type TvNav,
  TvNavProvider,
  type TvScreens,
  useNav,
} from '#tv/app/router';
import { requestSearch, takePendingSearch } from '#tv/app/searchRequest';
import { type SearchShellProps, setSearchShell } from '#tv/app/searchShell';
import { setVoiceSearchBackend } from '#tv/app/voiceSearch';
import { addRecentSearch } from '#tv/features/catalog/searchHistory';
import { TvSearch } from '#tv/features/catalog/TvSearch';

const movie = (id: string, title: string, genre = 'sci-fi'): MediaItem =>
  ({ id, title, video: null, metadata: { genres: [genre] } }) as unknown as MediaItem;

const series = (id: string, title: string, genre = 'drama'): Show =>
  ({ id, title, video: null, metadata: { genres: [genre] } }) as unknown as Show;

const found = (...results: SearchResponse['results']): SearchResponse => ({ query: '', results });

function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  const nav = useNav();
  onReady(nav);
  return null;
}

function mount({
  search = vi.fn(async () => found()),
  movies = [] as MediaItem[],
  shows = [] as Show[],
}: {
  search?: () => Promise<SearchResponse>;
  movies?: MediaItem[];
  shows?: Show[];
} = {}) {
  const client = {
    search,
    posterFor: (m: MediaItem) => `art:${m.id}`,
    showPosterFor: (s: Show) => `art:${s.id}`,
  } as unknown as KromaClient;
  let nav!: TvNav;
  render(
    onScreen(
      <EnvProvider platform="TV" overrides={{ physicalKeyboard: false }}>
        <ConnectionProvider value={{ movies, shows } as Connection}>
          <TvClientProvider client={client}>
            <TvNavProvider screens={{} as TvScreens}>
              <NavHandle
                onReady={(n) => {
                  nav = n;
                }}
              />
              <TvSearch />
            </TvNavProvider>
          </TvClientProvider>
        </ConnectionProvider>
      </EnvProvider>,
    ),
  );
  // The screen arms the press guard as it mounts, and would otherwise swallow
  // the test's first press.
  clearPressGuard();
  return { nav: () => nav, search };
}

// The on-screen keyboard is the only way to type on a remote-driven shell.
const type = (letter: string) => fireEvent.click(screen.getByLabelText(letter));

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
  takePendingSearch();
});

afterEach(() => {
  cleanup();
  clearPressGuard();
  vi.unstubAllGlobals();
  setSearchShell(null);
  setVoiceSearchBackend(null);
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
    setVoiceSearchBackend({ available: () => true, Session: () => null });
    mount();

    fireEvent.click(screen.getByLabelText('Voice search'));
    expect(screen.getByText('Speak now…')).toBeTruthy();
  });

  it('hands the whole screen to the platform’s own chrome where there is one', () => {
    setSearchShell({
      available: () => true,
      Shell: ({ placeholder, children }: SearchShellProps) => (
        <>
          <span>{`shell:${placeholder}`}</span>
          {children({ width: 900, height: 600 })}
        </>
      ),
    });
    mount();

    expect(screen.getByText('shell:Search')).toBeTruthy();
    // Ours is gone with it: the platform draws its own field and keys.
    expect(screen.queryByLabelText('A')).toBeNull();
  });

  it('opens on a query asked for from outside the app, and re-targets a second one', async () => {
    requestSearch('alien');
    const { search } = mount();
    await waitFor(() => expect(search).toHaveBeenCalledWith('alien'));

    act(() => {
      requestSearch('aliens');
    });
    await waitFor(() => expect(search).toHaveBeenCalledWith('aliens'));
  });
});
