import { z } from 'zod';
import { MediaFileId } from './ids';

export const VideoTrack = z.object({
  codec: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  hdr: z.boolean(),
  bitDepth: z.number().nullable(),
});
export type VideoTrack = z.infer<typeof VideoTrack>;

export const AudioTrack = z.object({
  index: z.number(),
  codec: z.string(),
  channels: z.number().nullable(),
  language: z.string().nullable(),
  title: z.string().nullish(),
  default: z.boolean(),
});
export type AudioTrack = z.infer<typeof AudioTrack>;

export const AudioVerdict = z.enum(['ok', 'highDynamics', 'quietDialog']);
export type AudioVerdict = z.infer<typeof AudioVerdict>;

/** EBU R128 loudness measurement of an item's default audio track: `lufsI` and
 * `dialogLufs` in LUFS, `lra` in LU, `truePeak` in dBTP. */
export const AudioAnalysis = z.object({
  lufsI: z.number(),
  lra: z.number(),
  truePeak: z.number(),
  dialogLufs: z.number().nullish(),
  verdict: AudioVerdict,
});
export type AudioAnalysis = z.infer<typeof AudioAnalysis>;

export const SubtitleTrack = z.object({
  language: z.string().nullable(),
  codec: z.string(),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrack>;

/** What both a logical item and one of its files carry about the bytes on disk. */
export const Tracks = z.object({
  container: z.string(),
  durationMs: z.number().nullable(),
  relPath: z.string().nullable(),
  video: VideoTrack.nullable(),
  audio: AudioTrack.nullable(),
  audioTracks: z.array(AudioTrack),
  subtitles: z.array(SubtitleTrack),
});

/** One physical file backing a logical [`MediaItem`]. `id` is a `short_hash` of
 * the absolute path, not a media-item id. */
export const MediaFile = Tracks.extend({
  id: MediaFileId,
  size: z.number().nullable(),
  edition: z.string().nullish(),
  probed: z.boolean(),
});
export type MediaFile = z.infer<typeof MediaFile>;

export const MarkerKind = z.enum(['intro', 'credits']);
export type MarkerKind = z.infer<typeof MarkerKind>;

export const Marker = z.object({
  kind: MarkerKind,
  startMs: z.number(),
  endMs: z.number(),
});
export type Marker = z.infer<typeof Marker>;

/** Server-side loudness-filter variant of the HLS master (night-mode volume
 * leveling for engines with no local audio DSP, e.g. Tizen AVPlay). The names
 * match the client Web Audio compressor modes; either one forces the AAC
 * transcode (a stream copy cannot be filtered), superseding `aac`. */
export const HlsAudioFilter = z.enum(['standard', 'night']);
export type HlsAudioFilter = z.infer<typeof HlsAudioFilter>;

/** Scrub-bar preview "storyboard": one sprite sheet of evenly-spaced thumbnails
 * plus the geometry needed to map a cursor time → a tile (YouTube-style hover
 * preview). Generated once per file by the server and cached on disk. */
export const StoryboardManifest = z.object({
  url: z.string(),
  interval: z.number(),
  tileW: z.number(),
  tileH: z.number(),
  cols: z.number(),
  rows: z.number(),
  count: z.number(),
  duration: z.number(),
});
export type StoryboardManifest = z.infer<typeof StoryboardManifest>;
