import { z } from 'zod';
import { ColorInfo, HdrFormat, StoryboardManifest } from '../media';
import { RequestId, RequestKind } from '../requests';
import { DownloadId } from './ids';

/** One video file of a download, at the index the torrent gave it. A ticket is
 * minted against that index, so it is not the file's position in this list. */
export const WatchableFile = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().min(1).max(1024),
  sizeBytes: z.number().int().nonnegative(),
  isVideo: z.boolean(),
  season: z.number().int().nonnegative().nullable().default(null),
  episode: z.number().int().nonnegative().nullable().default(null),
});
export type WatchableFile = z.infer<typeof WatchableFile>;

/** Where a download stands. Only `downloading` and `paused` are still short of
 * their last byte; the other three can be played end to end. */
export const WatchableStatus = z.enum([
  'downloading',
  'seeding',
  'completed',
  'imported',
  'paused',
]);
export type WatchableStatus = z.infer<typeof WatchableStatus>;

/** One download any signed-in user may watch before it finishes. `tmdbId` is
 * null where the module does not know or predates the field. `ephemeral` marks
 * one started to be watched, which is erased once nobody watches it. */
export const WatchableEntry = z.object({
  id: DownloadId,
  requestId: RequestId.nullable(),
  tmdbId: z.number().int().positive().nullable().default(null),
  title: z.string().nullable(),
  year: z.number().int().nullable(),
  kind: RequestKind,
  posterUrl: z.string().nullable(),
  progress: z.number().min(0).max(1),
  status: WatchableStatus,
  ephemeral: z.boolean().default(false),
  files: z.array(WatchableFile),
});
export type WatchableEntry = z.infer<typeof WatchableEntry>;

/** `GET {mount}/watch`. */
export const WatchableView = z.object({
  entries: z.array(WatchableEntry),
});
export type WatchableView = z.infer<typeof WatchableView>;

/** `POST {mount}/watch/:id/files/:file/ticket`: the credential one file is
 * played with, which is the module's own and never the core's. `url` is a
 * same-origin path a `<video>` plays as it is, answering byte ranges; `token` is
 * the same credential for the query of an HLS URL. */
export const WatchableTicket = z.object({
  url: z.string().min(1),
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
});
export type WatchableTicket = z.infer<typeof WatchableTicket>;

/** `POST {mount}/watch/start` body: the title to find a release for, named
 * the way the discovery listing names it. */
export const WatchableStartBody = z.object({
  tmdbId: z.number().int().positive(),
  kind: RequestKind,
  title: z.string().min(1),
  year: z.number().int().nullable(),
  season: z.number().int().nonnegative().nullable(),
  episode: z.number().int().nonnegative().nullable(),
});
export type WatchableStartBody = z.infer<typeof WatchableStartBody>;

/** `POST {mount}/watch/start`: the download that was started, or one found
 * already running for the same film when `reused`. */
export const WatchableStart = z.object({
  downloadId: DownloadId,
  release: z.string().min(1),
  reused: z.boolean(),
});
export type WatchableStart = z.infer<typeof WatchableStart>;

export const WatchableVideo = z.object({
  codec: z.string(),
  width: z.number().int().nonnegative().nullable(),
  height: z.number().int().nonnegative().nullable(),
  hdr: z.boolean().default(false),
  bitDepth: z.number().int().nonnegative().nullable().default(null),
  hdrFormat: HdrFormat.nullish(),
  dolbyVisionProfile: z.number().int().nullish(),
  color: ColorInfo.nullish(),
});
export type WatchableVideo = z.infer<typeof WatchableVideo>;

/** One audio stream, at the audio-relative `index` an HLS master muxes it by.
 * `default` is absent on a module that does not name one, which a player reads
 * as "the first track", never as "no default". */
export const WatchableAudio = z.object({
  index: z.number().int().nonnegative(),
  codec: z.string(),
  channels: z.number().int().nonnegative().nullable(),
  language: z.string().nullable(),
  title: z.string().nullish(),
  default: z.boolean().optional(),
});
export type WatchableAudio = z.infer<typeof WatchableAudio>;

/** One subtitle stream, at the subtitle-relative `index` its route names it by.
 * `text` is false for a picture track (PGS, VobSub), which no player draws. */
export const WatchableSubtitle = z.object({
  index: z.number().int().nonnegative(),
  codec: z.string(),
  language: z.string().nullable(),
  title: z.string().nullish(),
  forced: z.boolean().default(false),
  text: z.boolean().default(false),
});
export type WatchableSubtitle = z.infer<typeof WatchableSubtitle>;

export const WatchableChapter = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  title: z.string().nullish(),
});
export type WatchableChapter = z.infer<typeof WatchableChapter>;

/** `GET {mount}/watch/:id/files/:file/probe`: the streams of a file read off
 * what has arrived of it. Every figure is nullable and a null is a real answer:
 * `video` is null for a file with no picture and `durationMs` for a container
 * whose header says nothing. */
export const WatchableProbe = z.object({
  durationMs: z.number().int().nonnegative().nullable(),
  video: WatchableVideo.nullable(),
  audio: z.array(WatchableAudio),
  subtitles: z.array(WatchableSubtitle).default([]),
  chapters: z.array(WatchableChapter).default([]),
});
export type WatchableProbe = z.infer<typeof WatchableProbe>;

/** `GET {mount}/watch/:id/files/:file/storyboard`: the catalogue's sheet, drawn
 * while the file arrives. `ready` holds one character per tile, `1` once that
 * tile is drawn and `0` before. */
export const WatchableStoryboard = StoryboardManifest.extend({
  complete: z.boolean(),
  ready: z.string(),
});
export type WatchableStoryboard = z.infer<typeof WatchableStoryboard>;

export const WatchableFigure = z.union([z.number(), z.tuple([z.number(), z.number()]), z.string()]);
export type WatchableFigure = z.infer<typeof WatchableFigure>;

/** `GET {mount}/watch/:id/files/:file/progress`: how far one file has arrived.
 * `slices` splits the file in file order, and `arriving` indexes the slices the
 * source is asking for right now on that same split. `downBps`, `peers`,
 * `peersSeen` and `pieces` are those same figures under the names a module that
 * predates the declaration sends them by. */
export const WatchableProgress = z.object({
  progress: z.number().min(0).max(1),
  figures: z.record(z.string(), WatchableFigure).default({}),
  slices: z.array(z.number().min(0).max(100)).optional(),
  arriving: z.array(z.number().int().nonnegative()).default([]),
  downBps: z.number().nonnegative().default(0),
  upBps: z.number().nonnegative().default(0),
  peers: z.number().int().nonnegative().default(0),
  peersSeen: z.number().int().nonnegative().default(0),
  pieces: z.array(z.number().min(0).max(100)).default([]),
});
export type WatchableProgress = z.infer<typeof WatchableProgress>;
