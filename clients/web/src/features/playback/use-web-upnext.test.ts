// @vitest-environment jsdom

import type { MediaItem, Translate } from '@kroma/core';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  similar: vi.fn(async (): Promise<MediaItem[]> => []),
  backdropFor: vi.fn((item: MediaItem, w?: number) => `/backdrop/${item.id}?w=${w}`),
  posterFor: vi.fn((item: MediaItem, w?: number) => `/poster/${item.id}?w=${w}`),
}));

vi.mock('#web/shared/lib/api', () => ({ kromaClient: () => api }));

import { useWebUpNext } from './use-web-upnext';

const t: Translate = ((key: string) => key) as unknown as Translate;

const MOVIE = {
  id: 'm1',
  title: 'Arrival',
  durationMs: 6_960_000,
  metadata: { genres: ['Science-Fiction'] },
} as unknown as MediaItem;

const EPISODE = {
  id: 'e1',
  title: 'Severance',
  episodeTitle: 'Good News About Hell',
  showId: 's1',
  season: 1,
  episode: 1,
  durationMs: 3_180_000,
} as unknown as MediaItem;

beforeEach(() => {
  api.similar.mockReset().mockResolvedValue([]);
  api.backdropFor.mockReset().mockImplementation((item, w) => `/backdrop/${item.id}?w=${w}`);
  api.posterFor.mockReset().mockImplementation((item, w) => `/poster/${item.id}?w=${w}`);
});

describe('what it recommends against', () => {
  it('asks about the SHOW when the thing playing is an episode', async () => {
    renderHook(() => useWebUpNext(t, EPISODE));
    await waitFor(() => expect(api.similar).toHaveBeenCalledWith('s1'));
  });

  it('asks about the title itself for a movie', async () => {
    renderHook(() => useWebUpNext(t, MOVIE));
    await waitFor(() => expect(api.similar).toHaveBeenCalledWith('m1'));
  });

  it('says nothing rather than throwing when the server will not answer', async () => {
    api.similar.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useWebUpNext(t, MOVIE));
    await waitFor(() => expect(result.current.recommendations).toEqual([]));
  });

  it('stops at eighteen recommendations, however many came back', async () => {
    api.similar.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({ ...MOVIE, id: `r${i}` }) as MediaItem),
    );
    const { result } = renderHook(() => useWebUpNext(t, MOVIE));
    await waitFor(() => expect(result.current.recommendations).toHaveLength(18));
  });
});

describe('the cards', () => {
  it("titles an episode by the episode's own name, with the runtime on the sub-line", () => {
    const { result } = renderHook(() => useWebUpNext(t, MOVIE, [EPISODE]));
    const card = result.current.nextEpisodes[0];
    expect(card?.title).toBe('Good News About Hell');
    expect(card?.subtitle).toBe('S1 E1 · 53min');
  });

  it('falls back to the show title for an episode that has no name of its own', () => {
    const unnamed = { ...EPISODE, episodeTitle: undefined } as unknown as MediaItem;
    const { result } = renderHook(() => useWebUpNext(t, MOVIE, [unnamed]));
    expect(result.current.nextEpisodes[0]?.title).toBe('Severance');
  });

  it('asks for artwork at the width the card is drawn', () => {
    const { result } = renderHook(() => useWebUpNext(t, MOVIE, [MOVIE]));
    expect(result.current.nextEpisodes[0]?.posterUrl).toContain('?w=');
    expect(api.backdropFor).toHaveBeenCalledWith(MOVIE, expect.any(Number));
  });

  it('falls back to the poster where there is no backdrop', () => {
    api.backdropFor.mockReturnValue(null as unknown as string);
    const { result } = renderHook(() => useWebUpNext(t, MOVIE, [MOVIE]));
    expect(result.current.nextEpisodes[0]?.posterUrl).toContain('/poster/');
  });

  it('carries the first genre as the category label', () => {
    const { result } = renderHook(() => useWebUpNext(t, MOVIE, [MOVIE]));
    expect(result.current.nextEpisodes[0]?.categoryLabel).toBe('genre.science-fiction');
  });
});
