// @vitest-environment jsdom
import type { LibraryTitle } from '@kromatv/client/monitoring';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unitKey, useEpisodeMonitoring, useLibraryIndex, useTitleFollow } from './use-monitoring';

const client = {
  monitoring: {
    library: vi.fn(),
    monitor: vi.fn(),
    unmonitor: vi.fn(),
    setEpisodes: vi.fn(),
  },
};

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ client }) }));

let queries: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

const ROW = { kind: 'movie', tmdbId: 603 } as LibraryTitle;

beforeEach(() => {
  queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.monitoring.library.mockReset().mockResolvedValue([]);
  client.monitoring.monitor.mockReset().mockResolvedValue(undefined);
  client.monitoring.unmonitor.mockReset().mockResolvedValue(undefined);
  client.monitoring.setEpisodes.mockReset().mockResolvedValue(undefined);
});

describe('the library index', () => {
  it('reads the library under an admin key', async () => {
    const { result } = renderHook(() => useLibraryIndex(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([]));

    expect(queries.getQueryData(['admin', 'monitoring', 'library'])).toEqual([]);
  });
});

describe('following a title', () => {
  it('follows it, reports it saved, and offers an undo that unfollows', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useTitleFollow({ onSaved, onFailed: vi.fn() }), {
      wrapper,
    });

    act(() => result.current.set(ROW, true));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(ROW, true, expect.any(Function)));
    expect(client.monitoring.monitor).toHaveBeenCalledWith('movie', 603);

    act(() => onSaved.mock.calls[0]?.[2]());

    await waitFor(() => expect(client.monitoring.unmonitor).toHaveBeenCalledWith('movie', 603));
  });

  it('shows the row saving until the call settles', async () => {
    const { result } = renderHook(() => useTitleFollow({ onSaved: vi.fn(), onFailed: vi.fn() }), {
      wrapper,
    });

    act(() => result.current.set(ROW, false));
    expect(result.current.isSaving(ROW)).toBe(true);

    await waitFor(() => expect(result.current.isSaving(ROW)).toBe(false));
  });

  it('reports a failure', async () => {
    client.monitoring.monitor.mockRejectedValue(new Error('boom'));
    const onFailed = vi.fn();
    const { result } = renderHook(() => useTitleFollow({ onSaved: vi.fn(), onFailed }), {
      wrapper,
    });

    act(() => result.current.set(ROW, true));

    await waitFor(() => expect(onFailed).toHaveBeenCalled());
  });

  it('ignores a title with no tmdb id', () => {
    const { result } = renderHook(() => useTitleFollow({ onSaved: vi.fn(), onFailed: vi.fn() }), {
      wrapper,
    });

    act(() => result.current.set({ ...ROW, tmdbId: null } as LibraryTitle, true));

    expect(client.monitoring.monitor).not.toHaveBeenCalled();
  });
});

describe('monitoring episodes', () => {
  it('keys a season and an episode apart', () => {
    expect(unitKey({ season: 2 })).toBe('s2');
    expect(unitKey({ season: 2, episode: 5 })).toBe('s2e5');
  });

  it('sets a whole season', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(
      () => useEpisodeMonitoring({ tmdbId: 7, onSaved, onFailed: vi.fn() }),
      { wrapper },
    );

    act(() => result.current.set({ season: 2 }, true));
    expect(result.current.isSaving({ season: 2 })).toBe(true);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(client.monitoring.setEpisodes).toHaveBeenCalledWith(7, {
      seasons: [{ season: 2, monitored: true }],
    });
  });

  it('sets one episode and undoes it', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(
      () => useEpisodeMonitoring({ tmdbId: 7, onSaved, onFailed: vi.fn() }),
      { wrapper },
    );

    act(() => result.current.set({ season: 2, episode: 3 }, true));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    act(() => onSaved.mock.calls[0]?.[2]());

    await waitFor(() =>
      expect(client.monitoring.setEpisodes).toHaveBeenLastCalledWith(7, {
        episodes: [{ season: 2, episode: 3, monitored: false }],
      }),
    );
  });

  it('reports a failure', async () => {
    client.monitoring.setEpisodes.mockRejectedValue(new Error('boom'));
    const onFailed = vi.fn();
    const { result } = renderHook(
      () => useEpisodeMonitoring({ tmdbId: 7, onSaved: vi.fn(), onFailed }),
      { wrapper },
    );

    act(() => result.current.set({ season: 1 }, true));

    await waitFor(() => expect(onFailed).toHaveBeenCalled());
  });
});
