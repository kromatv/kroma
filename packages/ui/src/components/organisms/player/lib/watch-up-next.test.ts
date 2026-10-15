import { DownloadId } from '@kromatv/client/watchable';
import type { WatchNext } from '@kromatv/core';
import { describe, expect, it } from 'vitest';
import { watchUpNext } from './watch-up-next';

const t = (key: string, vars?: Record<string, unknown>) => `${key}:${String(vars?.n ?? '')}`;
const art = (still: string | null) => (still ? `https://img.test${still}` : null);

function next(episode: number, title: string | null, runtimeMin: number | null): WatchNext {
  return {
    season: 1,
    episode,
    title,
    stillUrl: title ? `/still/${episode}.jpg` : null,
    runtimeMin,
    subject: { kind: 'download', downloadId: DownloadId.parse('f13348a88094f2e1'), file: episode },
  };
}

describe('the up-next parts of a watch download', () => {
  it('offers the first following episode on the countdown card', () => {
    const parts = watchUpNext([next(2, 'Les Tartes aux myrtilles', 3)], { t, art });

    expect(parts.next).toEqual({
      title: 'Les Tartes aux myrtilles',
      subtitle: 'S1 E2',
      posterUrl: 'https://img.test/still/2.jpg',
    });
  });

  it('lists every following episode in the sheet, keyed by its number', () => {
    const parts = watchUpNext([next(2, 'A', 3), next(3, 'B', null)], { t, art });

    expect(parts.data.nextEpisodes.map(({ id, subtitle }) => ({ id, subtitle }))).toEqual([
      { id: 's1e2', subtitle: 'S1 E2 · 3min' },
      { id: 's1e3', subtitle: 'S1 E3' },
    ]);
    expect(parts.data.recommendations).toEqual([]);
  });

  it('names an episode TMDB has no title for by its number', () => {
    const parts = watchUpNext([next(2, null, null)], { t, art });

    expect(parts.next?.title).toBe('content.episodeN:2');
    expect(parts.next?.posterUrl).toBeNull();
  });

  it('offers nothing after the last episode', () => {
    expect(watchUpNext([], { t, art }).next).toBeNull();
  });
});
