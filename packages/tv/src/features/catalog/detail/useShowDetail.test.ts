// @vitest-environment jsdom

import {
  ItemId,
  type ProgressEntry,
  type ShowDetail,
  ShowId,
  type UpNext,
} from '@kroma/client/media';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  show: vi.fn(),
  progress: vi.fn(),
  upNext: vi.fn(),
  toggle: vi.fn(),
  watched: new Set<string>(),
}));

vi.mock('#tv/app/router', () => ({
  useClient: () => ({
    media: { show: api.show },
    playback: { progress: api.progress, upNext: api.upNext },
  }),
}));
vi.mock('#tv/app/providers/watched', () => ({
  useWatched: () => ({ has: (id: string) => api.watched.has(id), toggle: api.toggle }),
}));

import { useShowDetail } from './useShowDetail';

const SHOW = ShowId.parse('s1');
const EPISODE = ItemId.parse('i1');

const DETAIL = {
  show: { id: SHOW, title: 'Dune: Prophecy' },
  seasons: [{ number: 2 }, { number: 3 }],
} as unknown as ShowDetail;

const entry = (over: Partial<ProgressEntry>): ProgressEntry =>
  ({ itemId: EPISODE, positionMs: 300_000, durationMs: 1_200_000, ...over }) as ProgressEntry;

beforeEach(() => {
  vi.clearAllMocks();
  api.watched = new Set();
  api.show.mockResolvedValue(DETAIL);
  api.progress.mockResolvedValue([]);
  api.upNext.mockResolvedValue(null);
});

describe('loading the series', () => {
  it('opens on the first season the show declares', async () => {
    const { result } = renderHook(() => useShowDetail(SHOW));

    await waitFor(() => expect(result.current.detail).toBe(DETAIL));

    expect(api.show).toHaveBeenCalledWith(SHOW);
    expect(result.current.season).toBe(2);
    expect(result.current.activeSeason).toEqual({ number: 2 });
  });

  it('reports why the show would not load', async () => {
    api.show.mockRejectedValue(new Error('gone'));

    const { result } = renderHook(() => useShowDetail(SHOW));

    await waitFor(() => expect(result.current.error).toBe('gone'));
  });

  it("carries the server's up-next pick for the continue button", async () => {
    const pick = { resume: true } as UpNext;
    api.upNext.mockResolvedValue(pick);

    const { result } = renderHook(() => useShowDetail(SHOW));

    await waitFor(() => expect(result.current.upNext).toBe(pick));
    expect(api.upNext).toHaveBeenCalledWith(SHOW);
  });
});

describe('per-episode progress', () => {
  it('is a whole percentage, and only for an episode actually started', async () => {
    api.progress.mockResolvedValue([
      entry({}),
      entry({ itemId: ItemId.parse('i2'), positionMs: 0 }),
      entry({ itemId: ItemId.parse('i3'), durationMs: 0 }),
    ]);

    const { result } = renderHook(() => useShowDetail(SHOW));

    await waitFor(() => expect(result.current.epProgress).toEqual({ i1: 25 }));
  });

  it('drops the bar when the episode is marked watched, since the server clears it', async () => {
    api.progress.mockResolvedValue([entry({})]);
    const { result } = renderHook(() => useShowDetail(SHOW));
    await waitFor(() => expect(result.current.epProgress).toEqual({ i1: 25 }));

    act(() => result.current.toggleEpisodeWatched(EPISODE));

    expect(api.toggle).toHaveBeenCalledWith(EPISODE);
    expect(result.current.epProgress).toEqual({});
  });

  it('leaves the bar alone when the episode is being unmarked', async () => {
    api.watched = new Set([EPISODE]);
    api.progress.mockResolvedValue([entry({})]);
    const { result } = renderHook(() => useShowDetail(SHOW));
    await waitFor(() => expect(result.current.epProgress).toEqual({ i1: 25 }));

    act(() => result.current.toggleEpisodeWatched(EPISODE));

    expect(result.current.epProgress).toEqual({ i1: 25 });
  });
});
