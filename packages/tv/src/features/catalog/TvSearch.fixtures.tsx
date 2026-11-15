import type { DiscoverEntry, DiscoverResponse } from '@kromatv/client/discovery';
import type { MediaCard, MediaItem, SearchResponse, Show } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import { EnvProvider } from '#tv/app/providers/env';
import {
  TvClientProvider,
  type TvNav,
  TvNavProvider,
  type TvScreens,
  useNav,
} from '#tv/app/router';
import {
  createSearchRequests,
  type SearchRequests,
  SearchRequestsProvider,
} from '#tv/app/searchRequest';
import { type SearchShell, SearchShellProvider } from '#tv/app/searchShell';
import { type VoiceSearchBackend, VoiceSearchProvider } from '#tv/app/voiceSearch';
import { TvSearch } from '#tv/features/catalog/TvSearch';

const { clearPressGuard, render } = createInputTestHost();

export { clearPressGuard };

export const movie = (id: string, title: string, genre = 'sci-fi'): MediaItem =>
  ({ id, title, video: null, metadata: { genres: [genre] } }) as unknown as MediaItem;

export const series = (id: string, title: string, genre = 'drama'): Show =>
  ({ id, title, video: null, metadata: { genres: [genre] } }) as unknown as Show;

export const found = (...results: SearchResponse['results']): SearchResponse => ({
  query: '',
  results,
  people: [],
});

export const tmdb = (tmdbId: number, title: string, inLibrary = false): DiscoverEntry => ({
  kind: 'movie',
  tmdbId,
  title,
  year: null,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  rating: null,
  inLibrary,
  localId: inLibrary ? 'local-1' : null,
  requestId: null,
  requestStatus: null,
  requestProgress: null,
});

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

export function mount({
  search = vi.fn(async () => found()),
  discover = vi.fn(async () => known()),
  movies = [] as MediaCard[],
  shows = [] as Show[],
  requests = createSearchRequests(),
  voiceSearch = null,
  searchShell = null,
}: {
  search?: () => Promise<SearchResponse>;
  discover?: () => Promise<DiscoverResponse>;
  movies?: MediaCard[];
  shows?: Show[];
  requests?: SearchRequests;
  voiceSearch?: VoiceSearchBackend | null;
  searchShell?: SearchShell | null;
} = {}) {
  const client = fakeClient({
    media: {
      search,
      artwork: {
        posterFor: (m) => `art:${m.id}`,
        showPosterFor: (s) => `art:${s.id}`,
        resolve: (url) => url ?? null,
      },
    },
    discovery: { search: discover },
  });
  let nav!: TvNav;
  render(
    onScreen(
      <SearchRequestsProvider value={requests}>
        <VoiceSearchProvider value={voiceSearch}>
          <SearchShellProvider value={searchShell}>
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
            </EnvProvider>
          </SearchShellProvider>
        </VoiceSearchProvider>
      </SearchRequestsProvider>,
    ),
  );
  // The screen arms the press guard as it mounts, and would otherwise swallow
  // the test's first press.
  clearPressGuard();
  return { nav: () => nav, search, discover };
}

// The on-screen keyboard is the only way to type on a remote-driven shell.
export const type = (letter: string) => fireEvent.click(screen.getByLabelText(letter));
