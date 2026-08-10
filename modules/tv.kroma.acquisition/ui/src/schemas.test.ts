import { describe, expect, it } from 'vitest';
import {
  ManualAddBody,
  ManualReleaseView,
  ManualSearchBody,
  ManualSearchView,
  TorrentAnalysis,
  TorrentFileView,
} from './schemas';

describe('TorrentAnalysis', () => {
  it('parses a season pack with a season/episode per video file', () => {
    const analysis = TorrentAnalysis.parse({
      kind: 'season',
      seasons: [1],
      files: [
        { index: 0, path: 'Show/S01E01.mkv', sizeBytes: 1, isVideo: true, season: 1, episode: 1 },
        {
          index: 1,
          path: 'Show/readme.nfo',
          sizeBytes: 2,
          isVideo: false,
          season: null,
          episode: null,
        },
      ],
    });
    expect(analysis.kind).toBe('season');
    expect(analysis.files.filter((f) => f.isVideo)).toHaveLength(1);
    expect(analysis.files[1]?.season).toBeNull();
  });

  it('rejects a file whose season is absent rather than null', () => {
    expect(() =>
      TorrentFileView.parse({
        index: 0,
        path: 'a.mkv',
        sizeBytes: 1,
        isVideo: true,
        episode: null,
      }),
    ).toThrow();
  });
});

describe('ManualAddBody', () => {
  it('takes a movie grab with every episode field explicitly null', () => {
    const body = ManualAddBody.parse({
      magnetOrUrl: 'magnet:?xt=urn:btih:AB',
      kind: 'movie',
      title: 'The Matrix',
      year: 1999,
      season: null,
      episode: null,
      tmdbId: 603,
      onlyFiles: null,
      detailsUrl: null,
    });
    expect(body.tmdbId).toBe(603);
    expect(body.onlyFiles).toBeNull();
  });

  it('carries the picked file indices for a partial grab', () => {
    const body = ManualAddBody.parse({
      magnetOrUrl: 'https://tracker.example/dl/1.torrent',
      kind: 'season',
      title: 'Show',
      year: null,
      season: 2,
      episode: null,
      tmdbId: null,
      onlyFiles: [0, 2, 4],
      detailsUrl: 'https://tracker.example/t/1',
    });
    expect(body.onlyFiles).toEqual([0, 2, 4]);
  });

  it('rejects a body with no target at all', () => {
    expect(() => ManualAddBody.parse({ kind: 'movie' })).toThrow();
  });
});

describe('manual search', () => {
  const release = {
    title: 'The.Matrix.1999.1080p.BluRay.x265-GRP',
    guid: 'g1',
    indexerName: 'Tracker',
    downloadUrl: 'https://tracker.example/dl/1',
    sizeBytes: 8589934592,
    seeders: 40,
    leechers: 2,
    publishedAt: '2020-01-02',
    resolution: '1080p',
    codec: 'x265',
    source: 'BluRay',
    parsedTitle: 'The Matrix',
    year: 1999,
    season: null,
    episode: null,
    fullSeason: false,
    detailsUrl: null,
  };

  it('parses results alongside the indexers that failed', () => {
    const view = ManualSearchView.parse({
      releases: [release],
      indexerErrors: ['Tracker2: timeout'],
    });
    expect(view.releases[0]?.parsedTitle).toBe('The Matrix');
    expect(view.indexerErrors).toEqual(['Tracker2: timeout']);
  });

  it('keeps an indexer that could not size a release usable', () => {
    const view = ManualReleaseView.parse({ ...release, sizeBytes: null, seeders: null });
    expect(view.sizeBytes).toBeNull();
    expect(view.seeders).toBeNull();
  });

  it('rejects a release with no guid to grab it by', () => {
    const { guid, ...withoutGuid } = release;
    expect(guid).toBe('g1');
    expect(() => ManualReleaseView.parse(withoutGuid)).toThrow();
  });

  it('takes the free-text query body', () => {
    expect(ManualSearchBody.parse({ query: 'the matrix 1999' }).query).toBe('the matrix 1999');
    expect(() => ManualSearchBody.parse({})).toThrow();
  });
});
