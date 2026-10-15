import { RequestId } from '@kromatv/client/requests';
import { DownloadId, type WatchableEntry, type WatchableFile } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import {
  downloadedSpans,
  downloadOfTitle,
  featureFile,
  fileContainer,
  watchableByRequest,
  watchableTarget,
  watchableTargets,
  watchableTitle,
} from './watchable';

function file(over: Partial<WatchableFile> = {}): WatchableFile {
  return {
    index: 5,
    name: 'Sintel.mp4',
    sizeBytes: 129241752,
    isVideo: true,
    season: null,
    episode: null,
    ...over,
  };
}

function entry(over: Partial<WatchableEntry> = {}): WatchableEntry {
  return {
    id: DownloadId.parse('22e86113ba9a6db4'),
    requestId: null,
    tmdbId: 45745,
    title: 'Sintel',
    year: 2010,
    kind: 'movie',
    posterUrl: null,
    progress: 0.34,
    status: 'downloading',
    ephemeral: false,
    files: [file()],
    ...over,
  };
}

describe('featureFile', () => {
  it('picks the sole video of a download', () => {
    expect(featureFile(entry())?.index).toBe(5);
  });

  it('picks the feature over the sample that shipped beside it', () => {
    const release = entry({
      files: [file({ index: 1, name: 'sample.mkv', sizeBytes: 40_000_000 }), file({ index: 2 })],
    });

    expect(featureFile(release)?.index).toBe(2);
  });

  it('skips a file the server did not mark as video', () => {
    const release = entry({
      files: [file({ index: 1, sizeBytes: 900_000_000, isVideo: false }), file({ index: 2 })],
    });

    expect(featureFile(release)?.index).toBe(2);
  });

  it('picks the episode asked for out of a season pack, whatever its size', () => {
    const pack = entry({
      files: [
        file({ index: 1, season: 1, episode: 1, sizeBytes: 900_000_000 }),
        file({ index: 2, season: 1, episode: 2 }),
      ],
    });

    expect(featureFile(pack, { season: 1, episode: 2 })?.index).toBe(2);
  });

  it('falls back to the largest video where no file names the episode', () => {
    const release = entry({
      files: [file({ index: 1, sizeBytes: 40_000_000 }), file({ index: 2 })],
    });

    expect(featureFile(release, { season: 1, episode: 4 })?.index).toBe(2);
  });

  it('answers a download with nothing playable in it with null', () => {
    expect(featureFile(entry({ files: [] }))).toBeNull();
    expect(featureFile(entry({ files: [file({ isVideo: false })] }))).toBeNull();
  });
});

describe('watchableTarget', () => {
  const started = DownloadId.parse('9619ccec50f68056');

  it('finds nothing while the server does not list the download yet', () => {
    expect(watchableTarget([entry()], started)).toBeNull();
  });

  it('finds nothing while the download lists no video', () => {
    const listed = entry({ id: started, files: [file({ isVideo: false })] });

    expect(watchableTarget([listed], started)).toBeNull();
  });

  it('finds the feature of the download once its files are known', () => {
    const listed = entry({ id: started, files: [file({ index: 3 })] });

    expect(watchableTarget([entry(), listed], started)).toEqual({
      entry: listed,
      file: listed.files[0],
    });
  });

  it('finds nothing for a download that was never started', () => {
    expect(watchableTarget([entry()], null)).toBeNull();
  });

  it('finds the file a link names by its listed index, sample or not', () => {
    const listed = entry({
      id: started,
      files: [file({ index: 1, sizeBytes: 40_000_000 }), file({ index: 2 })],
    });

    expect(watchableTarget([listed], started, 1)?.file.index).toBe(1);
  });

  it('finds nothing for a named file that is not a video', () => {
    const listed = entry({ id: started, files: [file({ index: 1, isVideo: false })] });

    expect(watchableTarget([listed], started, 1)).toBeNull();
  });
});

describe('watchableTargets', () => {
  it('keeps the order the server sent', () => {
    const targets = watchableTargets([
      entry({ id: DownloadId.parse('d1'), title: 'Zoulou' }),
      entry({ id: DownloadId.parse('d2'), title: 'Alpha' }),
    ]);

    expect(targets.map((target) => target.entry.title)).toEqual(['Zoulou', 'Alpha']);
  });

  it('drops a download with no video, which no surface can offer', () => {
    const targets = watchableTargets([
      entry({ id: DownloadId.parse('d1'), files: [] }),
      entry({ id: DownloadId.parse('d2') }),
    ]);

    expect(targets.map((target) => target.entry.id)).toEqual(['d2']);
  });

  it('answers an empty list with no targets', () => {
    expect(watchableTargets([])).toEqual([]);
  });
});

describe('watchableByRequest', () => {
  it('finds the download a request grabbed', () => {
    const map = watchableByRequest([entry({ requestId: RequestId.parse('req_7') })]);

    expect(map.get(RequestId.parse('req_7'))?.file.index).toBe(5);
  });

  it('leaves out a download nobody requested', () => {
    expect(watchableByRequest([entry({ requestId: null })]).size).toBe(0);
  });

  it('leaves out a request whose download holds no video', () => {
    const map = watchableByRequest([entry({ requestId: RequestId.parse('req_7'), files: [] })]);

    expect(map.size).toBe(0);
  });

  it('answers a request that grabbed several downloads with the first', () => {
    const request = RequestId.parse('req_7');
    const map = watchableByRequest([
      entry({ id: DownloadId.parse('d1'), requestId: request }),
      entry({ id: DownloadId.parse('d2'), requestId: request }),
    ]);

    expect(map.get(request)?.entry.id).toBe('d1');
  });

  it('keeps two requests apart', () => {
    const map = watchableByRequest([
      entry({ id: DownloadId.parse('d1'), requestId: RequestId.parse('req_1') }),
      entry({ id: DownloadId.parse('d2'), requestId: RequestId.parse('req_2') }),
    ]);

    expect(map.size).toBe(2);
    expect(map.get(RequestId.parse('req_2'))?.entry.id).toBe('d2');
  });
});

describe('watchableTitle', () => {
  const sintel = { kind: 'movie', tmdbId: 45745, title: 'Sintel', year: 2010 } as const;

  it('names a film by its TMDB id, title and year', () => {
    expect(watchableTitle(sintel)).toEqual({ ...sintel, season: null, episode: null });
  });

  it('names the episode of a series it was handed', () => {
    const show = { ...sintel, kind: 'show' } as const;

    expect(watchableTitle(show, { season: 1, episode: 3 })).toEqual({
      ...show,
      season: 1,
      episode: 3,
    });
  });

  it('offers nothing for a series with no episode named', () => {
    expect(watchableTitle({ ...sintel, kind: 'show' })).toBeNull();
  });

  it('offers nothing for a film with no TMDB id to find a release by', () => {
    expect(watchableTitle({ ...sintel, tmdbId: null })).toBeNull();
  });
});

describe('downloadOfTitle', () => {
  const film = { tmdbId: 603, kind: 'movie', season: null, episode: null } as const;
  const episode = { tmdbId: 1399, kind: 'show', season: 2, episode: 5 } as const;

  it('finds the download the server lists for the film', () => {
    const listed = entry({ id: DownloadId.parse('d2'), tmdbId: 603 });

    expect(downloadOfTitle([entry(), listed], film)).toBe('d2');
  });

  it('finds nothing where no download names the film', () => {
    expect(downloadOfTitle([entry({ tmdbId: null })], film)).toBeNull();
  });

  it('finds the download holding the episode asked for', () => {
    const other = entry({
      id: DownloadId.parse('d1'),
      tmdbId: 1399,
      files: [file({ season: 1, episode: 1 })],
    });
    const asked = entry({
      id: DownloadId.parse('d2'),
      tmdbId: 1399,
      files: [file({ season: 2, episode: 5 })],
    });

    expect(downloadOfTitle([other, asked], episode)).toBe('d2');
  });

  it('never takes another episode of the same show for the one asked', () => {
    const other = entry({ tmdbId: 1399, files: [file({ season: 1, episode: 1 })] });

    expect(downloadOfTitle([other], episode)).toBeNull();
  });

  it('finds a season pack holding the episode among others', () => {
    const pack = entry({
      id: DownloadId.parse('d3'),
      tmdbId: 1399,
      files: [file({ index: 1, season: 2, episode: 4 }), file({ index: 2, season: 2, episode: 5 })],
    });

    expect(downloadOfTitle([pack], episode)).toBe('d3');
  });

  it('does not count a file that is not a video as holding the episode', () => {
    const subtitles = entry({
      tmdbId: 1399,
      files: [file({ season: 2, episode: 5, isVideo: false })],
    });

    expect(downloadOfTitle([subtitles], episode)).toBeNull();
  });
});

describe('downloadedSpans', () => {
  it('lays whole slices over the runtime and merges neighbours', () => {
    expect(downloadedSpans([100, 100, 40, 0, 100], 50)).toEqual([
      [0, 20],
      [40, 50],
    ]);
  });

  it('draws nothing before a slice is whole', () => {
    expect(downloadedSpans([99, 0], 10)).toEqual([]);
  });
});

describe('fileContainer', () => {
  it('reads the container off the extension, in lower case', () => {
    expect(fileContainer('Sintel.2010.1080p.MKV')).toBe('mkv');
  });

  it('reads no container off a name with no extension', () => {
    expect(fileContainer('Sintel')).toBe('');
  });

  it('does not take a leading dot for an extension', () => {
    expect(fileContainer('.hidden')).toBe('');
  });
});
