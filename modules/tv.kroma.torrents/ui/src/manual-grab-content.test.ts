import type { TorrentAnalysis, TorrentFileView } from '@kroma/module-acquisition/schemas';
import { describe, expect, it } from 'vitest';
import { detect } from './manual-grab-content';

function video(index: number, season: number | null, episode: number | null): TorrentFileView {
  return {
    index,
    path: `file-${index}.mkv`,
    sizeBytes: 1024,
    isVideo: true,
    season,
    episode,
  };
}

function analysis(kind: string, files: TorrentFileView[], seasons: number[]): TorrentAnalysis {
  return { kind, seasons, files };
}

describe('what the files say the grab is for', () => {
  it('reads a single episode down to its season and number', () => {
    const found = detect(analysis('episode', [video(0, 3, 7)], [3]));

    expect(found).toMatchObject({ kind: 'episode', season: '3', episode: '7', certain: true });
  });

  it('reads a season pack as its season, with no episode to name', () => {
    const found = detect(analysis('season', [video(0, 2, 1), video(1, 2, 2), video(2, 2, 3)], [2]));

    expect(found).toMatchObject({ kind: 'season', season: '2', episode: '', episodeCount: 3 });
  });

  it('leaves a multi-season pack without one season, because it has several', () => {
    const found = detect(analysis('series', [video(0, 1, 1), video(1, 2, 1)], [1, 2]));

    expect(found).toMatchObject({ kind: 'season', season: '', certain: true });
    expect(found.seasons).toEqual([1, 2]);
  });

  it('reads a film as a film', () => {
    const found = detect(analysis('movie', [video(0, null, null)], []));

    expect(found).toMatchObject({ kind: 'movie', season: '', episode: '', certain: true });
  });

  it('reports uncertain when nothing in the torrent was recognised', () => {
    expect(detect(analysis('unknown', [], [])).certain).toBe(false);
  });
});
