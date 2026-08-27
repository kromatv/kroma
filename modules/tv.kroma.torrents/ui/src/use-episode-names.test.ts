// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EpisodeInfo } from './schemas';
import { useEpisodeNames } from './use-episode-names';

const keys: (readonly unknown[] | null)[] = [];
const episodes = vi.fn();
let answer: EpisodeInfo[] | null = null;

vi.mock('@kroma/module-sdk', () => ({
  useFetch: (key: readonly unknown[] | null, fn: () => Promise<unknown>) => {
    keys.push(key);
    if (key) void fn();
    return { data: key ? answer : null };
  },
}));

vi.mock('./api', () => ({ useTorrentsApi: () => ({ episodes }) }));

function info(episode: number, name: string): EpisodeInfo {
  return { episode, name, overview: null, airDate: null, stillUrl: null };
}

describe('useEpisodeNames', () => {
  beforeEach(() => {
    keys.length = 0;
    answer = null;
    episodes.mockReset();
    episodes.mockResolvedValue([]);
  });

  it('keys the answer by episode number, which is what a file list looks names up by', () => {
    answer = [info(1, 'Winter Is Coming'), info(2, 'The Kingsroad')];

    const { result } = renderHook(() => useEpisodeNames(1399, 2));

    expect(result.current.get(2)).toEqual(info(2, 'The Kingsroad'));
    expect(result.current.size).toBe(2);
  });

  it('asks the provider for the season it was handed', () => {
    renderHook(() => useEpisodeNames(1399, 2));

    expect(episodes).toHaveBeenCalledWith(1399, 2);
  });

  it('asks nothing at all while the title is unknown', () => {
    renderHook(() => useEpisodeNames(null, 2));

    expect(keys).toEqual([null]);
    expect(episodes).not.toHaveBeenCalled();
  });

  it('asks nothing at all while the season is unknown', () => {
    renderHook(() => useEpisodeNames(1399, undefined));

    expect(keys).toEqual([null]);
    expect(episodes).not.toHaveBeenCalled();
  });

  it('treats season zero as a season, because specials are one', () => {
    renderHook(() => useEpisodeNames(1399, 0));

    expect(episodes).toHaveBeenCalledWith(1399, 0);
  });

  it('hands back one shared empty map, so a caller memoing on it does not rerun', () => {
    const first = renderHook(() => useEpisodeNames(1399, 2)).result.current;
    const second = renderHook(() => useEpisodeNames(603, 1)).result.current;

    expect(first).toBe(second);
    expect(first.size).toBe(0);
  });
});
