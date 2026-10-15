// @vitest-environment jsdom
import type { DiscoverEpisode } from '@kromatv/client/discovery';
import type { WatchableFile } from '@kromatv/client/watchable';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WatchableTarget } from '../watchable';
import { target } from './watch.fixture';
import { useWatchFollowing } from './watch-following';

const E1: WatchableFile = {
  index: 0,
  name: 'Kaamelott.S01E01.mkv',
  sizeBytes: 1_000,
  isVideo: true,
  season: 1,
  episode: 1,
};
const E2: WatchableFile = { ...E1, index: 1, name: 'Kaamelott.S01E02.mkv', episode: 2 };

function playing(file: WatchableFile): WatchableTarget {
  const film = target();
  return {
    entry: { ...film.entry, kind: 'show', title: 'Kaamelott', tmdbId: 11466, files: [E1, E2] },
    file,
  };
}

const listed = (episode: number): DiscoverEpisode => ({
  episode,
  title: `Episode ${episode}`,
  overview: null,
  stillUrl: `/still/${episode}.jpg`,
  airDate: '2005-01-03',
  runtimeMin: 4,
});

function discoveryOf(seasons: Record<number, DiscoverEpisode[]>, showSeasons: number[]) {
  const season = vi.fn(async (_tmdbId: number, number: number) => ({
    episodes: seasons[number] ?? [],
  }));
  const detail = vi.fn(async () => ({
    title: 'Kaamelott',
    seasons: showSeasons.map((number) => ({
      season: number,
      name: null,
      episodeCount: 2,
      airDate: null,
      available: false,
      episodesAvailable: 0,
      requested: false,
    })),
  }));
  return { season, detail };
}

describe('the episodes after the one being watched', () => {
  it('titles the next episode of the pack from the season TMDB lists', async () => {
    const discovery = discoveryOf({ 1: [listed(1), listed(2)] }, [1]);

    const { result } = renderHook(() => useWatchFollowing({ discovery, target: playing(E1) }));
    await waitFor(() => expect(result.current[0]?.title).toBe('Episode 2'));

    expect(discovery.season).toHaveBeenCalledWith(11466, 1);
    expect(discovery.detail).not.toHaveBeenCalled();
  });

  it('reads the show and its next season once this one runs out', async () => {
    const discovery = discoveryOf({ 1: [listed(1), listed(2)], 2: [listed(1)] }, [1, 2]);

    const { result } = renderHook(() => useWatchFollowing({ discovery, target: playing(E2) }));
    await waitFor(() => expect(result.current[0]).toMatchObject({ season: 2, episode: 1 }));

    expect(discovery.detail).toHaveBeenCalledWith('tv', 11466);
    expect(discovery.season).toHaveBeenCalledWith(11466, 2);
  });

  it('follows the download alone when TMDB does not answer', async () => {
    const season = vi.fn(async () => {
      throw new Error('offline');
    });
    const discovery = { season, detail: vi.fn() };

    const { result } = renderHook(() => useWatchFollowing({ discovery, target: playing(E1) }));
    await waitFor(() => expect(season).toHaveBeenCalled());

    expect(result.current.map(({ episode, title }) => ({ episode, title }))).toEqual([
      { episode: 2, title: null },
    ]);
  });
});
