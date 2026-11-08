// @vitest-environment jsdom

import type { Trailer, TrailerList } from '@kromatv/client/trailers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  push: vi.fn(),
  list: vi.fn(),
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string) =>
    ({
      'trailer.watch': 'Bande-annonce',
      'trailer.watchSubtitled': 'Bande-annonce (VOST)',
      'trailer.watchOriginal': 'Bande-annonce (VO)',
    })[key] ?? key,
}));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({
    query: {
      trailers: {
        list: (kind: string, tmdbId: number) => ({
          queryKey: ['trailers', kind, tmdbId],
          queryFn: () => state.list(kind, tmdbId),
        }),
      },
    },
  }),
}));

const { useTrailerLink } = await import('./useTrailerLink');

const trailer = (over: Partial<Trailer> = {}): Trailer => ({
  video: 'Ox8ZLF6cGM0',
  name: 'Official Trailer',
  language: 'en',
  version: 'localized',
  kind: 'trailer',
  official: true,
  ...over,
});

function renderLink(tmdbId: number | null, list: TrailerList) {
  const queries = new QueryClient();
  state.list.mockResolvedValue(list);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queries}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useTrailerLink('movie', tmdbId, 'Superman'), { wrapper });
  const settled = () => waitFor(() => expect(queries.isFetching()).toBe(0));
  return { ...view, settled };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the trailer button on a detail page', () => {
  it('names a trailer subtitled in the viewer’s language', async () => {
    const { result } = renderLink(1061474, {
      playable: true,
      trailers: [trailer({ version: 'subtitled' })],
    });

    await waitFor(() => expect(result.current?.label).toBe('Bande-annonce (VOST)'));
  });

  it('names a trailer in neither the viewer’s language nor its subtitles', async () => {
    const { result } = renderLink(1061474, {
      playable: true,
      trailers: [trailer({ version: 'original' })],
    });

    await waitFor(() => expect(result.current?.label).toBe('Bande-annonce (VO)'));
  });

  it('stays hidden while no module on the server can fetch trailers', async () => {
    const { result, settled } = renderLink(1061474, { playable: false, trailers: [trailer()] });

    await settled();

    expect(state.list).toHaveBeenCalledOnce();
    expect(result.current).toBeNull();
  });

  it('stays hidden for a title TMDB lists no trailer for', async () => {
    const { result, settled } = renderLink(1061474, { playable: true, trailers: [] });

    await settled();

    expect(state.list).toHaveBeenCalledOnce();
    expect(result.current).toBeNull();
  });

  it('asks nothing for a title no provider matched', async () => {
    const { result, settled } = renderLink(null, { playable: true, trailers: [trailer()] });

    await settled();

    expect(state.list).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('opens the trailer player for the title it was drawn for', async () => {
    const { result } = renderLink(1061474, { playable: true, trailers: [trailer()] });
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current?.open());

    expect(state.push).toHaveBeenCalledWith('/trailer/movie/1061474?title=Superman');
  });
});
