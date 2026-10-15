import {
  DownloadId,
  type WatchableFile,
  type WatchableProbe,
  type WatchableProgress,
  type WatchableTicket,
} from '@kromatv/client/watchable';
import type { WatchableTarget } from '../watchable';

export const DOWNLOAD = DownloadId.parse('9619ccec50f68056');

export const FILE: WatchableFile = {
  index: 5,
  name: 'Sintel.mkv',
  sizeBytes: 129_241_752,
  isVideo: true,
  season: null,
  episode: null,
};

/** A fresh object every call, so a test can hand the same file to a hook twice
 * and see whether identity or the file's name is what it follows. */
export function target(): WatchableTarget {
  return {
    entry: {
      id: DOWNLOAD,
      requestId: null,
      tmdbId: 45745,
      title: 'Sintel',
      year: 2010,
      kind: 'movie',
      posterUrl: null,
      progress: 0.34,
      status: 'downloading',
      ephemeral: false,
      files: [FILE],
    },
    file: FILE,
  };
}

export const TARGET = target();

export const ELSEWHERE: WatchableTarget = {
  entry: { ...TARGET.entry, id: DownloadId.parse('22e86113ba9a6db4') },
  file: FILE,
};

export const PROBE: WatchableProbe = {
  durationMs: 888_064,
  video: { codec: 'h264', width: 1024, height: 436, hdr: false, bitDepth: null },
  audio: [{ index: 0, codec: 'aac', channels: 6, language: 'eng' }],
  subtitles: [],
  chapters: [],
};

export const TICKET: WatchableTicket = {
  url: '/api/module/tv.kroma.torrents/play/tok_1',
  token: 'tok_1',
  expiresAt: 2_000_000_000,
};

export const arrived = (): WatchableProgress => ({
  progress: 0.34,
  figures: {},
  arriving: [],
  downBps: 320_000,
  upBps: 0,
  peers: 4,
  peersSeen: 11,
  pieces: [100, 100, 0],
});
