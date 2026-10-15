import {
  DownloadId,
  type WatchableEntry,
  type WatchableProbe,
  type WatchableTicket,
} from '@kromatv/client/watchable';
import { describe, expect, it, vi } from 'vitest';
import type { WatchableTarget } from './watchable';
import {
  cancelWatch,
  downloadStage,
  stageDownload,
  startedDownload,
  startStage,
  type WatchReady,
  watchRelease,
} from './watchable-stage';

const STARTED = {
  kind: 'started',
  downloadId: DownloadId.parse('9619ccec50f68056'),
  release: 'Sintel.2010.720p',
  reused: false,
} as const;

const PROBE: WatchableProbe = {
  durationMs: 888064,
  video: { codec: 'h264', width: 1024, height: 436, hdr: false, bitDepth: null },
  audio: [{ index: 0, codec: 'aac', channels: 2, language: 'eng' }],
  subtitles: [],
  chapters: [],
};

const TICKET: WatchableTicket = {
  url: '/api/module/tv.kroma.torrents/play/abc',
  token: 'abc',
  expiresAt: 1789802352612,
};

const FILE = {
  index: 5,
  name: 'Sintel.mp4',
  sizeBytes: 129241752,
  isVideo: true,
  season: null,
  episode: null,
};

const ENTRY: WatchableEntry = {
  id: STARTED.downloadId,
  requestId: null,
  tmdbId: 45745,
  title: 'Sintel',
  year: 2010,
  kind: 'movie',
  posterUrl: null,
  progress: 0.01,
  status: 'downloading',
  ephemeral: false,
  files: [FILE],
};

const TARGET: WatchableTarget = { entry: ENTRY, file: FILE };

describe('startStage', () => {
  it('is searching while the server looks for a source', () => {
    expect(startStage('pending')).toEqual({
      stage: 'searching',
      release: null,
      downloadId: null,
    });
  });

  it('hands over to the download once one is running', () => {
    expect(startStage(STARTED)).toBeNull();
  });

  it("carries the server's words when no release was found", () => {
    expect(startStage({ kind: 'noRelease', message: "Aucune source n'a répondu" })).toEqual({
      stage: 'failed',
      failure: 'noSource',
      message: "Aucune source n'a répondu",
    });
  });

  it('keeps a sweep no indexer could answer apart from a title nobody has', () => {
    expect(
      startStage({ kind: 'noIndexer', message: 'Internet Archive: definition missing' }),
    ).toEqual({
      stage: 'failed',
      failure: 'noIndexer',
      message: 'Internet Archive: definition missing',
    });
  });

  it('fails plainly when the request itself threw', () => {
    expect(startStage('failed')).toEqual({ stage: 'failed', failure: 'failed', message: null });
  });
});

describe('startedDownload', () => {
  it('reads the download a start answered with', () => {
    expect(startedDownload(STARTED)?.downloadId).toBe('9619ccec50f68056');
  });

  it('reads nothing from a start still on its way or refused', () => {
    expect(startedDownload('pending')).toBeNull();
    expect(startedDownload({ kind: 'noRelease', message: null })).toBeNull();
  });
});

describe('downloadStage', () => {
  it('is connecting while the download is not listed with a video', () => {
    const stage = downloadStage({
      downloadId: STARTED.downloadId,
      release: STARTED.release,
      target: null,
      probe: 'pending',
      ticket: 'pending',
    });

    expect(stage).toEqual({
      stage: 'connecting',
      release: 'Sintel.2010.720p',
      downloadId: STARTED.downloadId,
    });
  });

  it('is buffering while the server cannot read the file yet', () => {
    const stage = downloadStage({
      downloadId: null,
      release: STARTED.release,
      target: TARGET,
      probe: 'pending',
      ticket: TICKET,
    });

    expect(stage).toEqual({
      stage: 'buffering',
      release: 'Sintel.2010.720p',
      downloadId: ENTRY.id,
      target: TARGET,
    });
  });

  it('is buffering while the file has no credential to be played with yet', () => {
    const stage = downloadStage({
      downloadId: null,
      release: null,
      target: TARGET,
      probe: PROBE,
      ticket: 'pending',
    });

    expect(stage).toMatchObject({ stage: 'buffering', target: TARGET });
  });

  it('is ready once the file has been probed and its credential minted', () => {
    const stage = downloadStage({
      downloadId: null,
      release: null,
      target: TARGET,
      probe: PROBE,
      ticket: TICKET,
    });

    expect(stage).toEqual({
      stage: 'ready',
      release: null,
      downloadId: ENTRY.id,
      target: TARGET,
      probe: PROBE,
      ticket: TICKET,
    });
  });

  it('fails when the probe itself threw', () => {
    const stage = downloadStage({
      downloadId: null,
      release: null,
      target: TARGET,
      probe: 'failed',
      ticket: TICKET,
    });

    expect(stage).toMatchObject({ stage: 'failed', failure: 'failed' });
  });

  it('fails when the credential was refused', () => {
    const stage = downloadStage({
      downloadId: null,
      release: null,
      target: TARGET,
      probe: PROBE,
      ticket: 'failed',
    });

    expect(stage).toMatchObject({ stage: 'failed', failure: 'failed' });
  });
});

describe('stageDownload', () => {
  it('names the download a start answered with while its files are unknown', () => {
    const connecting = {
      stage: 'connecting',
      release: null,
      downloadId: STARTED.downloadId,
    } as const;

    expect(stageDownload(connecting)).toBe(STARTED.downloadId);
  });

  it('names the listed download once a file of it is known', () => {
    const buffering = {
      stage: 'buffering',
      release: null,
      downloadId: ENTRY.id,
      target: TARGET,
    } as const;

    expect(stageDownload(buffering)).toBe(ENTRY.id);
  });

  it('names nothing while the server looks for a release', () => {
    expect(stageDownload({ stage: 'searching', release: null, downloadId: null })).toBeNull();
  });

  it('names nothing about a refusal, which carries no download at all', () => {
    expect(stageDownload({ stage: 'failed', failure: 'noSource', message: null })).toBeNull();
  });
});

describe("the viewer's own cancel", () => {
  const connecting = { stage: 'connecting', release: null, downloadId: ENTRY.id } as const;

  it('erases the download the screen was waiting on', async () => {
    const cancel = vi.fn(async () => true);

    const erased = await cancelWatch({ cancel }, connecting);

    expect(erased).toBe(true);
    expect(cancel).toHaveBeenCalledWith(ENTRY.id);
  });

  it('erases nothing while the server has not named a download', async () => {
    const cancel = vi.fn(async () => true);

    await cancelWatch({ cancel }, { stage: 'searching', release: null, downloadId: null });

    expect(cancel).not.toHaveBeenCalled();
  });

  it('answers false where the module keeps the download', async () => {
    const cancel = vi.fn(async () => false);

    await expect(cancelWatch({ cancel }, connecting)).resolves.toBe(false);
  });

  it('answers false where the module could not be reached', async () => {
    const cancel = vi.fn(async (): Promise<boolean> => {
      throw new Error('502');
    });

    await expect(cancelWatch({ cancel }, connecting)).resolves.toBe(false);
  });

  it('answers false with no module to ask', async () => {
    await expect(cancelWatch(null, connecting)).resolves.toBe(false);
  });
});

describe("the film's own line while it is being watched", () => {
  const ready = (release: string | null): WatchReady => ({
    stage: 'ready',
    release,
    downloadId: ENTRY.id,
    target: TARGET,
    probe: PROBE,
    ticket: TICKET,
  });

  it('names the release the source went looking for', () => {
    expect(watchRelease(ready('Sintel.2010.720p'), 'Sintel')).toBe('Sintel.2010.720p');
  });

  it('falls back to the file it picked when nothing named a release', () => {
    expect(watchRelease(ready(null), 'Sintel')).toBe('Sintel.mp4');
  });

  it('says nothing rather than saying the title twice', () => {
    expect(watchRelease(ready(null), 'Sintel.mp4')).toBeNull();
  });
});
