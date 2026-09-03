import { z } from 'zod';
import { ItemId } from '../media';

/** Cache directory usage + counts, nested in [`StorageInfo`]. */
export const CacheInfo = z.object({
  dir: z.string(),
  bytes: z.number(),
  limit: z.string(),
  transcodeBytes: z.number(),
  transcodeLimit: z.string(),
  imagesBytes: z.number(),
  imagesCount: z.number(),
  enrichedItems: z.number(),
  enrichedShows: z.number(),
  embeddings: z.number(),
});
export type CacheInfo = z.infer<typeof CacheInfo>;

const Usage = z.object({
  totalBytes: z.number(),
  usedBytes: z.number(),
  availableBytes: z.number(),
});

/** One mounted volume's usage. */
export const Volume = Usage.extend({
  name: z.string(),
  mount: z.string(),
  fs: z.string(),
});
export type Volume = z.infer<typeof Volume>;

/** `GET /api/admin/storage`. */
export const StorageInfo = Usage.extend({
  volumes: z.array(Volume),
  mediaBytes: z.number(),
  cache: CacheInfo,
});
export type StorageInfo = z.infer<typeof StorageInfo>;

/** The windows every dashboard chart and the history screen offer. `live` is the
 *  server's rolling in-memory ring; every other value is read from persisted
 *  samples and survives a restart. */
export const MetricRange = z.enum(['live', '12h', '24h', '7d', '30d', '90d', '1y', 'all']);
export type MetricRange = z.infer<typeof MetricRange>;

/** The mean of each series over the window on screen, for the chart footers. */
export const MetricMeans = z.object({
  cpuKroma: z.number(),
  cpuSystem: z.number(),
  cpuMedia: z.number(),
  ramKroma: z.number(),
  ramSystem: z.number(),
  bwLocal: z.number(),
  bwRemote: z.number(),
});
export type MetricMeans = z.infer<typeof MetricMeans>;

/** Time-series history (oldest → newest). Percentages are 0..100. `cpuMedia` is
 * the ffmpeg share of `cpuKroma`. */
export const MetricsSeries = z.object({
  cpuKroma: z.array(z.number()),
  cpuSystem: z.array(z.number()),
  cpuMedia: z.array(z.number()).default([]),
  ramKroma: z.array(z.number()),
  ramSystem: z.array(z.number()),
  bwLocal: z.array(z.number()),
  bwRemote: z.array(z.number()),
});
export type MetricsSeries = z.infer<typeof MetricsSeries>;

/** A point-in-time metrics snapshot plus the recent history series. `cpuKroma`
 * covers the whole process tree, ffmpeg children included; `cpuMedia` is what
 * those children alone cost out of it. `complete` is false where the server has
 * no samples covering the whole window, so a client says "not running that long"
 * instead of drawing zeroes. */
export const MetricsSnapshot = z.object({
  cpuKroma: z.number(),
  cpuSystem: z.number(),
  cpuMedia: z.number().default(0),
  mediaProcs: z.number().default(0),
  cores: z.number().default(0),
  ramKromaBytes: z.number(),
  ramUsedBytes: z.number(),
  ramTotalBytes: z.number(),
  bwLocalMbps: z.number(),
  bwRemoteMbps: z.number(),
  uptimeSecs: z.number(),
  sampleIntervalMs: z.number().default(3000),
  series: MetricsSeries,
  range: MetricRange.default('live'),
  /** Unix seconds of the first sample in `series`. */
  startedAt: z.number().default(0),
  /** Seconds between two samples in `series`. */
  stepSecs: z.number().default(3),
  means: MetricMeans.nullish(),
  complete: z.boolean().default(true),
});
export type MetricsSnapshot = z.infer<typeof MetricsSnapshot>;

/** The pipeline the host re-encodes on, and the sentence explaining it: a device
 *  that is present, listed and unusable looks exactly like no device at all. */
export const TranscodeHardware = z.object({
  accel: z.string(),
  reason: z.string(),
  accelerated: z.boolean(),
});
export type TranscodeHardware = z.infer<typeof TranscodeHardware>;

/** One live remux. `speed` is the figure to read first: under 1.0 the encoder is
 *  producing less than a second of film per second and the player will run dry.
 *  `video` is `copy` | `h264` | `h264-1080` | `h264-720`, `audio` is `copy` |
 *  `aac` | `aac-standard` | `aac-night`, `accel` is `videotoolbox` | `qsv` |
 *  `vaapi` | `nvenc` | `software`, and `effort` (`quality` | `realtime`) only
 *  means anything on the software path. */
export const LiveTranscode = z.object({
  id: z.string(),
  itemId: ItemId,
  audioTrack: z.number(),
  video: z.string(),
  audio: z.string(),
  transcodesVideo: z.boolean(),
  transcodesAudio: z.boolean(),
  accel: z.string(),
  effort: z.string(),
  onTheCpu: z.boolean(),
  pid: z.number().nullish(),
  sourceWidth: z.number().nullish(),
  sourceHeight: z.number().nullish(),
  targetWidth: z.number().nullish(),
  targetHeight: z.number().nullish(),
  anchorSecs: z.number(),
  startedAt: z.number(),
  speed: z.number(),
  fps: z.number(),
  frames: z.number(),
  dropped: z.number(),
  outTimeMs: z.number(),
  segments: z.number(),
  bytes: z.number(),
  running: z.boolean(),
  title: z.string().nullish(),
  showTitle: z.string().nullish(),
  season: z.number().nullish(),
  episode: z.number().nullish(),
  /** Percent of the whole box this one ffmpeg is spending. */
  cpu: z.number().nullish(),
});
export type LiveTranscode = z.infer<typeof LiveTranscode>;

/** `GET /api/admin/transcodes`. */
export const Transcodes = z.object({
  hardware: TranscodeHardware,
  sessions: z.array(LiveTranscode),
  encoding: z.number(),
  cacheBytes: z.number(),
});
export type Transcodes = z.infer<typeof Transcodes>;
