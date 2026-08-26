// @vitest-environment jsdom
import type { KromaClient, MediaItem, Translate } from '@kroma/core';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTvUpNext } from './use-tv-upnext';

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

function stubClient(similar: MediaItem[] = []) {
  return {
    similar: vi.fn(async () => similar),
    backdropFor: vi.fn((item: MediaItem, w?: number) => `/backdrop/${item.id}?w=${w}`),
    posterFor: vi.fn((item: MediaItem, w?: number) => `/poster/${item.id}?w=${w}`),
  } as unknown as KromaClient;
}

describe('what it recommends against', () => {
  it('asks about the SHOW when the thing playing is an episode', async () => {
    const client = stubClient();
    renderHook(() => useTvUpNext(client, t, EPISODE));
    await waitFor(() => expect(client.similar).toHaveBeenCalledWith('s1'));
  });

  it('asks about the title itself for a movie', async () => {
    const client = stubClient();
    renderHook(() => useTvUpNext(client, t, MOVIE));
    await waitFor(() => expect(client.similar).toHaveBeenCalledWith('m1'));
  });

  it('says nothing rather than throwing when the server will not answer', async () => {
    const client = stubClient();
    (client.similar as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE));
    await waitFor(() => expect(result.current.data.recommendations).toEqual([]));
  });
});

describe('the cards', () => {
  it("titles an episode by the episode's own name, with the runtime on the sub-line", () => {
    const client = stubClient();
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE, [EPISODE]));
    const card = result.current.data.nextEpisodes[0];
    expect(card?.title).toBe('Good News About Hell');
    expect(card?.subtitle).toBe('S1 E1 · 53min');
  });

  it('falls back to the show title for an episode that has no name of its own', () => {
    const client = stubClient();
    const unnamed = { ...EPISODE, episodeTitle: undefined } as unknown as MediaItem;
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE, [unnamed]));
    expect(result.current.data.nextEpisodes[0]?.title).toBe('Severance');
  });

  it('asks for artwork at the width the card is drawn', () => {
    const client = stubClient();
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE, [MOVIE]));
    expect(result.current.data.nextEpisodes[0]?.posterUrl).toContain('?w=');
    expect(client.backdropFor).toHaveBeenCalledWith(MOVIE, expect.any(Number));
  });

  it('falls back to the poster where there is no backdrop', () => {
    const client = stubClient();
    (client.backdropFor as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE, [MOVIE]));
    expect(result.current.data.nextEpisodes[0]?.posterUrl).toContain('/poster/');
  });

  it('carries the first genre as the category label', () => {
    const client = stubClient();
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE, [MOVIE]));
    expect(result.current.data.nextEpisodes[0]?.categoryLabel).toBe('genre.science-fiction');
  });
});

describe('the id map the router is handed', () => {
  it('holds every card that was drawn, episodes and recommendations alike', async () => {
    const reco = { ...MOVIE, id: 'm2' } as MediaItem;
    const client = stubClient([reco]);
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE, [EPISODE]));
    await waitFor(() => expect(result.current.byId.size).toBe(2));
    expect(result.current.byId.get('e1')).toBe(EPISODE);
    expect(result.current.byId.get('m2')).toBe(reco);
  });

  it('stops at eighteen recommendations, however many came back', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...MOVIE, id: `r${i}` }) as MediaItem);
    const client = stubClient(many);
    const { result } = renderHook(() => useTvUpNext(client, t, MOVIE));
    await waitFor(() => expect(result.current.data.recommendations).toHaveLength(18));
  });
});
