import {
  DownloadId,
  type WatchableEntry,
  type WatchableProbe,
  type WatchableTicket,
} from '@kromatv/client/watchable';
import type { PlayEnv } from '@kromatv/core';
import { describe, expect, it, vi } from 'vitest';
import { fakeWatchable } from '#web/shared/lib/watchable.fixture';
import { watchableSource } from './watchable-source';

const hlsMasterUrl = vi.fn(() => 'hls://master');

const DOWNLOAD = DownloadId.parse('9619ccec50f68056');

const FILE = {
  index: 5,
  name: 'Sintel.2010.MKV',
  sizeBytes: 129241752,
  isVideo: true,
  season: null,
  episode: null,
};

const ENTRY: WatchableEntry = {
  id: DOWNLOAD,
  requestId: null,
  tmdbId: 45745,
  title: 'Sintel',
  year: 2010,
  kind: 'movie',
  posterUrl: null,
  progress: 0.2,
  status: 'downloading',
  ephemeral: false,
  files: [FILE],
};

const PROBE: WatchableProbe = {
  durationMs: 888_064,
  video: { codec: 'hevc', width: 1920, height: 800, hdr: false, bitDepth: null },
  audio: [
    { index: 0, codec: 'eac3', channels: 6, language: 'fre' },
    { index: 1, codec: 'aac', channels: 2, language: 'eng' },
  ],
  subtitles: [],
  chapters: [],
};

const CHROME: PlayEnv = { platform: 'web', safari: false };

const TICKET: WatchableTicket = {
  url: '/api/module/tv.kroma.torrents/play/abc',
  token: 'abc',
  expiresAt: 1789802352612,
};

const source = (probe: WatchableProbe = PROBE, startSec = 0) =>
  watchableSource({
    watchable: fakeWatchable({ hlsMasterUrl }),
    target: { entry: ENTRY, file: FILE },
    probe,
    ticket: TICKET,
    title: 'Sintel',
    startSec,
  });

describe('a watchable file as the player plays it', () => {
  it('names no catalogue row, so nothing a row answers is asked', () => {
    expect(source().itemId).toBeNull();
  });

  it('opens where the device left it, since no row holds a position', () => {
    expect(source(PROBE, 640).startSec).toBe(640);
    expect(source().startSec).toBe(0);
  });

  it('plays only through the master, whatever the stored override', () => {
    const played = source();

    expect(played.directUrl).toBeNull();
    expect(played.decide(CHROME, 'direct', false).kind).toBe('web-mse');
  });

  it('transcodes Dolby for Chrome and copies it for Safari', () => {
    const played = source();

    expect(played.decide(CHROME, 'auto', false).aacMaster).toBe(true);
    expect(played.decide({ ...CHROME, safari: true }, 'auto', false).aacMaster).toBe(false);
  });

  it('asks for the master of this file, on its ticket, declaring what the browser decodes', () => {
    source().masterUrl(true, 600, 1);

    expect(hlsMasterUrl).toHaveBeenCalledWith({
      id: DOWNLOAD,
      file: 5,
      token: 'abc',
      aac: true,
      startSec: 600,
      audio: 1,
      declaration: { copyCodecs: expect.any(Array), videoCodecs: expect.any(Array) },
    });
  });

  it('reads the duration, the picture and the audio from the probe', () => {
    const played = source();

    expect(played.durationMs).toBe(888_064);
    expect(played.aspect).toBeCloseTo(2.4);
    expect(played.video).toMatchObject({ codec: 'hevc', width: 1920, height: 800 });
    expect(played.audioTracks.map((track) => [track.index, track.default])).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it('plays the soundtrack the file marks, not the one that happens to be first', () => {
    const marked: WatchableProbe = {
      ...PROBE,
      audio: [
        {
          ...PROBE.audio[0],
          index: 0,
          codec: 'eac3',
          channels: 6,
          language: 'fre',
          default: false,
        },
        { ...PROBE.audio[1], index: 1, codec: 'aac', channels: 2, language: 'eng', default: true },
      ],
    };

    const played = source(marked);

    expect(played.audioTracks.map((track) => track.default)).toEqual([false, true]);
  });

  it('carries the picture signalling the probe measured, rather than assuming SDR', () => {
    const graded: WatchableProbe = {
      ...PROBE,
      video: { codec: 'hevc', width: 3840, height: 1600, hdr: true, bitDepth: 10 },
    };

    expect(source(graded).video).toMatchObject({ hdr: true, bitDepth: 10 });
  });

  it('knows its size from the listing and its container from the file name', () => {
    const played = source();

    expect(played.sizeBytes).toBe(129241752);
    expect(played.container).toBe('mkv');
  });

  it('draws no aspect for a file the probe found no picture in', () => {
    expect(source({ ...PROBE, video: null }).aspect).toBeUndefined();
  });

  it('draws no aspect for a picture ffprobe opened and did not measure', () => {
    const unmeasured = { codec: 'h264', width: null, height: null, hdr: false, bitDepth: null };
    const played = source({ ...PROBE, video: unmeasured });

    expect(played.aspect).toBeUndefined();
    expect(played.video).toMatchObject({ codec: 'h264', width: null, height: null });
  });
});
