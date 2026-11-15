import type { DiscoverEntry, DiscoverResponse } from '@kromatv/client/discovery';
import type { KromaClient } from '@kromatv/client';
import type { MediaCard, MediaItem, SearchResponse, Show } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import { EnvProvider } from '#tv/app/providers/env';
import { TvClientProvider, type TvNav, TvNavProvider, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import {
  createSearchRequests,
  type SearchRequests,
  SearchRequestsProvider,
} from '#tv/app/search-request';
import { type SearchShell, SearchShellProvider } from '#tv/app/search-shell';
import { type VoiceSearchBackend, VoiceSearchProvider } from '#tv/app/voice-search';
import { mediaItem, metadata, show } from '#tv/features/catalog/media.fixtures';
import { TvSearch } from '#tv/features/catalog/tv-search.component';

const host = createInputTestHost();

export const clearPressGuard = () => host.clearPressGuard();

export const movie = (id: string, title: string, genre = 'sci-fi'): MediaItem =>
  mediaItem({ id, title, metadata: metadata({ genres: [genre] }) });

export const series = (id: string, title: string, genre = 'drama'): Show =>
  show({ id, title, metadata: metadata({ genres: [genre] }) });

export const found = (...results: SearchResponse['results']): SearchResponse => ({
  query: '',
  results,
  people: [],
});

const discoverEntry = (
  tmdbId: number,
  title: string,
  library: Pick<DiscoverEntry, 'inLibrary' | 'localId'>,
): DiscoverEntry => ({
  kind: 'movie',
  tmdbId,
  title,
  year: null,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  rating: null,
  requestId: null,
  requestStatus: null,
  requestProgress: null,
  ...library,
});

export const tmdb = (tmdbId: number, title: string) =>
  discoverEntry(tmdbId, title, { inLibrary: false, localId: null });

export const tmdbInLibrary = (tmdbId: number, title: string) =>
  discoverEntry(tmdbId, title, { inLibrary: true, localId: 'local-1' });

export const known = (...results: DiscoverEntry[]): DiscoverResponse => ({
  results,
  page: 1,
  totalPages: 1,
});

function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  const nav = useNav();
  onReady(nav);
  return null;
}

const connectionOf = (movies: MediaCard[], shows: Show[]): Connection => ({
  platform: 'TV',
  status: 'ready',
  servers: [],
  activeServerUrl: null,
  activeServerName: null,
  error: '',
  online: true,
  serverVersion: null,
  compat: 'ok',
  client: null,
  movies,
  shows,
  activity: null,
  discovering: false,
  discovered: [],
  deepLink: null,
  addServer: () => undefined,
  setActiveServer: () => undefined,
  discover: () => undefined,
  forgetServer: () => undefined,
  clearDeepLink: () => undefined,
});

interface MountOptions {
  search?: () => Promise<SearchResponse>;
  discover?: () => Promise<DiscoverResponse>;
  movies?: MediaCard[];
  shows?: Show[];
  requests?: SearchRequests;
  voiceSearch?: VoiceSearchBackend | null;
  searchShell?: SearchShell | null;
}

function searchClient({ search, discover }: Pick<MountOptions, 'search' | 'discover'>) {
  const asked = {
    search: search ?? vi.fn(() => Promise.resolve(found())),
    discover: discover ?? vi.fn(() => Promise.resolve(known())),
  };
  const client = fakeClient({
    media: {
      search: asked.search,
      artwork: {
        posterFor: (m) => `art:${m.id}`,
        showPosterFor: (s) => `art:${s.id}`,
        resolve: (url) => url ?? null,
      },
    },
    discovery: { search: asked.discover },
  });
  return { client, ...asked };
}

interface SearchTreeProps {
  client: KromaClient;
  connection: Connection;
  onReady: (nav: TvNav) => void;
}

function NavTree({ client, connection, onReady }: Readonly<SearchTreeProps>) {
  return (
    <EnvProvider platform="TV" overrides={{ physicalKeyboard: false }}>
      <ConnectionProvider value={connection}>
        <TvClientProvider client={client}>
          <TvNavProvider screens={stubScreens()}>
            <NavHandle onReady={onReady} />
            <TvSearch />
          </TvNavProvider>
        </TvClientProvider>
      </ConnectionProvider>
    </EnvProvider>
  );
}

export function mount(options: MountOptions = {}) {
  const { client, search, discover } = searchClient(options);
  const connection = connectionOf(options.movies ?? [], options.shows ?? []);
  let nav!: TvNav;
  host.render(
    onScreen(
      <SearchRequestsProvider value={options.requests ?? createSearchRequests()}>
        <VoiceSearchProvider value={options.voiceSearch ?? null}>
          <SearchShellProvider value={options.searchShell ?? null}>
            <NavTree
              client={client}
              connection={connection}
              onReady={(n) => {
                nav = n;
              }}
            />
          </SearchShellProvider>
        </VoiceSearchProvider>
      </SearchRequestsProvider>,
    ),
  );
  // The screen arms the press guard as it mounts, and would otherwise swallow
  // the test's first press.
  host.clearPressGuard();
  return { nav: () => nav, search, discover };
}

// The on-screen keyboard is the only way to type on a remote-driven shell.
export const type = (letter: string) => fireEvent.click(screen.getByLabelText(letter));
