import type { TorrentFileView } from '@kroma/module-acquisition/schemas';
import { describe, expect, it } from 'vitest';
import { bytesOf, contentsLayout, groupContents, withFilesSelected } from './contents-files';

function file(
  index: number,
  path: string,
  {
    video = true,
    season = null as number | null,
    episode = null as number | null,
    size = 100,
  } = {},
): TorrentFileView {
  return { index, path, sizeBytes: size, isVideo: video, season, episode };
}

describe('how a torrent is laid out', () => {
  it('groups episodes by season, in season and episode order', () => {
    const groups = groupContents([
      file(0, 'S02E02.mkv', { season: 2, episode: 2 }),
      file(1, 'S01E02.mkv', { season: 1, episode: 2 }),
      file(2, 'S01E01.mkv', { season: 1, episode: 1 }),
      file(3, 'S02E01.mkv', { season: 2, episode: 1 }),
    ]);

    expect(groups.map((g) => g.season)).toEqual([1, 2]);
    expect(groups[0]?.files.map((f) => f.episode)).toEqual([1, 2]);
    expect(groups[1]?.files.map((f) => f.episode)).toEqual([1, 2]);
  });

  it('keeps a film out of the season groups', () => {
    const groups = groupContents([file(0, 'Dune.mkv')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'film', kind: 'film', season: null });
  });

  it('puts everything that is not video in its own group, last', () => {
    const groups = groupContents([
      file(0, 'S01E01.mkv', { season: 1, episode: 1 }),
      file(1, 'sub.srt', { video: false }),
      file(2, 'info.nfo', { video: false }),
    ]);

    expect(groups.at(-1)).toMatchObject({ key: 'extras', kind: 'extras' });
    expect(groups.at(-1)?.files).toHaveLength(2);
  });

  it('files an episode with no season under one anyway, rather than losing it', () => {
    const groups = groupContents([file(0, 'E05.mkv', { episode: 5 })]);

    expect(groups[0]?.season).toBe(0);
  });

  it('adds up what a group weighs', () => {
    expect(bytesOf([file(0, 'a', { size: 300 }), file(1, 'b', { size: 700 })])).toBe(1000);
  });
});

describe('what the list says about itself', () => {
  it('says nothing above a torrent that is one file', () => {
    const groups = groupContents([file(0, 'Dune.mkv')]);

    expect(contentsLayout(groups)).toEqual({ showHeadings: false, showTotal: false });
  });

  it('leaves a lone season to its own heading rather than totalling it twice', () => {
    const groups = groupContents([
      file(0, 'S01E01.mkv', { season: 1, episode: 1 }),
      file(1, 'S01E02.mkv', { season: 1, episode: 2 }),
    ]);

    expect(contentsLayout(groups)).toEqual({ showHeadings: true, showTotal: false });
  });

  it('does not total a season just because an nfo sits beside it', () => {
    const groups = groupContents([
      file(0, 'S01E01.mkv', { season: 1, episode: 1 }),
      file(1, 'S01E02.mkv', { season: 1, episode: 2 }),
      file(2, 'release.nfo', { video: false, size: 8000 }),
    ]);

    expect(contentsLayout(groups)).toEqual({ showHeadings: true, showTotal: false });
  });

  it('totals a torrent no single heading covers', () => {
    const groups = groupContents([
      file(0, 'S01E01.mkv', { season: 1, episode: 1 }),
      file(1, 'S02E01.mkv', { season: 2, episode: 1 }),
    ]);

    expect(contentsLayout(groups)).toEqual({ showHeadings: true, showTotal: true });
  });
});

describe('picking a group of files', () => {
  it('adds a whole group without disturbing what was already picked', () => {
    const next = withFilesSelected(new Set([9]), [file(0, 'a'), file(1, 'b')], { include: true });

    expect([...next].sort()).toEqual([0, 1, 9]);
  });

  it('clears only the files it was handed', () => {
    const next = withFilesSelected(new Set([0, 1, 9]), [file(0, 'a'), file(1, 'b')], {
      include: false,
    });

    expect([...next]).toEqual([9]);
  });
});
