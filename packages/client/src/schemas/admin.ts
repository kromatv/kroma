// Runtime schemas for the admin-core domain (users, settings, storage, metrics,
// history, invites, activity). Follows the accounts.ts template: each schema
// mirrors a ts-rs generated wire type, adds runtime validation via `.parse()`
// and branded ids, and carries a `true satisfies SameKeys<…>` compile-time drift
// guard so a Rust struct change + `gen:types` breaks the build here until updated.

import { z } from 'zod';
import { Permission } from './accounts';
import { ItemId, LibraryId, UserId } from './ids';

/** One account in the admin "Membres & partage" table carries email, a derived
 * role, last-activity and a live `online` flag. */
export const AdminUser = z.object({
  id: UserId,
  email: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullish(),
  permissions: z.array(Permission),
  role: z.string(),
  createdAt: z.string(),
  lastSeen: z.string().nullish(),
  online: z.boolean(),
});
export type AdminUser = z.infer<typeof AdminUser>;

/** `GET /api/admin/users`. */
export const AdminUsers = z.object({
  users: z.array(AdminUser),
  libraryCount: z.number(),
});
export type AdminUsers = z.infer<typeof AdminUsers>;

/** `GET /api/admin/stats/overview`. */
export const AdminOverview = z.object({
  users: z.number(),
  online: z.number(),
  invites: z.number(),
  items: z.number(),
  shows: z.number(),
  libraries: z.number(),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

/** A named, multi-folder library (`GET /api/admin/libraries`). `id` is an opaque
 * library id, not a media id, so it stays a plain string. */
export const AdminLibrary = z.object({
  id: LibraryId,
  name: z.string(),
  kind: z.string(),
  folders: z.array(z.string()),
  itemCount: z.number(),
  sizeBytes: z.number(),
  lastScan: z.string().nullable(),
  autoScan: z.boolean(),
});
export type AdminLibrary = z.infer<typeof AdminLibrary>;

/** One editable (or read-only) setting row. `kind` (`toggle`|`select`|`text`|
 * `value`) is a plain string on the wire and `value` is an untyped `unknown`
 * (ts-rs `serde_json::Value`), so this is a flat object, not a tagged union. */
export const SettingRow = z.object({
  key: z.string(),
  label: z.string(),
  desc: z.string().nullish(),
  kind: z.string(),
  options: z.array(z.string()),
  value: z.unknown(),
  applied: z.boolean(),
  configured: z.boolean().nullish(),
});
export type SettingRow = z.infer<typeof SettingRow>;

/** A titled group of rows. */
export const SettingGroup = z.object({
  title: z.string(),
  desc: z.string().nullish(),
  rows: z.array(SettingRow),
});
export type SettingGroup = z.infer<typeof SettingGroup>;

/** `GET /api/admin/settings?view=…`. */
export const SettingsView = z.object({
  view: z.string(),
  groups: z.array(SettingGroup),
});
export type SettingsView = z.infer<typeof SettingsView>;

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

/** One mounted volume's usage. */
export const Volume = z.object({
  name: z.string(),
  mount: z.string(),
  fs: z.string(),
  totalBytes: z.number(),
  usedBytes: z.number(),
  availableBytes: z.number(),
});
export type Volume = z.infer<typeof Volume>;

/** `GET /api/admin/storage`. */
export const StorageInfo = z.object({
  volumes: z.array(Volume),
  totalBytes: z.number(),
  usedBytes: z.number(),
  availableBytes: z.number(),
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

export const WatchKind = z.enum(['movie', 'tv']);
export type WatchKind = z.infer<typeof WatchKind>;

/** Milliseconds watched per kind. Every kind is present, zeroes included. */
export const WatchTotals = z.record(WatchKind, z.number());
export type WatchTotals = z.infer<typeof WatchTotals>;

/** Time-series history (oldest → newest). Percentages are 0..100. */
export const MetricsSeries = z.object({
  cpuKroma: z.array(z.number()),
  cpuSystem: z.array(z.number()),
  /** The ffmpeg share of `cpuKroma`. */
  cpuMedia: z.array(z.number()).default([]),
  ramKroma: z.array(z.number()),
  ramSystem: z.array(z.number()),
  bwLocal: z.array(z.number()),
  bwRemote: z.array(z.number()),
});
export type MetricsSeries = z.infer<typeof MetricsSeries>;

/** A point-in-time metrics snapshot plus the recent history series. */
export const MetricsSnapshot = z.object({
  /** The whole process tree, ffmpeg children included, not the server alone. */
  cpuKroma: z.number(),
  cpuSystem: z.number(),
  /** What the ffmpeg children alone cost, out of `cpuKroma`. */
  cpuMedia: z.number().default(0),
  /** How many child processes the server is holding open. */
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
  /** Which window `series` covers. */
  range: MetricRange.default('live'),
  /** Unix seconds of the first sample in `series`. */
  startedAt: z.number().default(0),
  /** Seconds between two samples in `series`. */
  stepSecs: z.number().default(3),
  means: MetricMeans.nullish(),
  /** False where the server has no samples covering the whole window, so a
   *  client says "not running that long" instead of drawing zeroes. */
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
 *  producing less than a second of film per second and the player will run dry. */
export const LiveTranscode = z.object({
  id: z.string(),
  itemId: z.string(),
  audioTrack: z.number(),
  /** `copy` | `h264` | `h264-1080` | `h264-720`. */
  video: z.string(),
  /** `copy` | `aac` | `aac-standard` | `aac-night`. */
  audio: z.string(),
  transcodesVideo: z.boolean(),
  transcodesAudio: z.boolean(),
  /** `videotoolbox` | `qsv` | `vaapi` | `nvenc` | `software`. */
  accel: z.string(),
  /** `quality` | `realtime`; only means anything on the software path. */
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

/** One finished playback: who watched what, when, and on which device. */
export const PlayEntry = z.object({
  id: z.string(),
  userId: z.string().nullish(),
  username: z.string(),
  itemId: z.string().nullish(),
  /** The series an episode belongs to, so a row opens the show rather than one
   *  episode. Absent for a film. */
  showId: z.string().nullish(),
  /** False where the title has left the catalog, so a row does not offer a link
   *  into a page that no longer exists. */
  inCatalog: z.boolean().default(true),
  kind: z.string(),
  title: z.string(),
  showTitle: z.string().nullish(),
  season: z.number().nullish(),
  episode: z.number().nullish(),
  device: z.string().nullish(),
  player: z.string().nullish(),
  /** `direct` | `transcode`. */
  mode: z.string().nullish(),
  /** `LAN` | `WAN`. */
  network: z.string().nullish(),
  videoLabel: z.string().nullish(),
  audioLabel: z.string().nullish(),
  /** The library the title belongs to, for the history screen's filter. */
  library: z.string().nullish(),
  startedAt: z.number(),
  endedAt: z.number(),
  watchedMs: z.number(),
});
export type PlayEntry = z.infer<typeof PlayEntry>;

/** One entry of the history screen's library filter. */
export const HistoryLibrary = z.object({ id: z.string(), name: z.string() });
export type HistoryLibrary = z.infer<typeof HistoryLibrary>;

/** `GET /api/admin/stats/plays`: one page of the watch log, newest first. */
export const PlaysPage = z.object({
  plays: z.array(PlayEntry),
  total: z.number(),
});
export type PlaysPage = z.infer<typeof PlaysPage>;

/** One weekly bucket of the play-history chart. */
export const HistoryBucket = z.object({
  label: z.string(),
  filmsMs: z.number(),
  tvMs: z.number(),
});
export type HistoryBucket = z.infer<typeof HistoryBucket>;

/** `GET /api/admin/stats/history`. `bucketDays` is the width the server chose
 *  from the window, so a client labels the axis with what it actually got. */
export const HistoryStats = z.object({
  buckets: z.array(HistoryBucket),
  totalFilmsMs: z.number(),
  totalTvMs: z.number(),
  totals: WatchTotals.nullish(),
  bucketDays: z.number().default(7),
});
export type HistoryStats = z.infer<typeof HistoryStats>;

/** One title in the most-watched panel. `viewers` is the number of distinct
 *  accounts, which is what separates one person watching eight times from eight
 *  people watching once. */
export const MostWatchedEntry = z.object({
  itemId: z.string(),
  title: z.string(),
  kind: WatchKind,
  year: z.number().nullish(),
  posterUrl: z.string().nullish(),
  plays: z.number(),
  viewers: z.number(),
});
export type MostWatchedEntry = z.infer<typeof MostWatchedEntry>;

/** One column of the most-watched panel: a kind, and its ranking. An empty
 *  `entries` is an answer, not a reason to drop the column. */
export const MostWatchedColumn = z.object({
  kind: WatchKind,
  entries: z.array(MostWatchedEntry),
});
export type MostWatchedColumn = z.infer<typeof MostWatchedColumn>;

/** `GET /api/admin/stats/most-watched`. */
export const MostWatched = z.object({
  columns: z.array(MostWatchedColumn),
});
export type MostWatched = z.infer<typeof MostWatched>;

/** Per-series aggregate over its episodes, for the elements list. */
export const EpStats = z.object({
  episodes: z.number(),
  probed: z.number(),
  storyboarded: z.number(),
  seasons: z.number(),
  markerSeasons: z.number(),
});
export type EpStats = z.infer<typeof EpStats>;

/** A snapshot of what the server is doing. */
export const Activity = z.object({
  phase: z.string(),
  scanning: z.boolean(),
  libraries: z.number(),
  shows: z.number(),
  items: z.number(),
  enrichDone: z.number(),
  enrichTotal: z.number(),
  probeDone: z.number(),
  probeTotal: z.number(),
  lastScanAt: z.string().nullable(),
});
export type Activity = z.infer<typeof Activity>;

/** Aggregated per-user watch stats over a window (dashboard "Top des
 * utilisateurs"). `filmsMs` and `tvMs` are kept beside `byKind` because they are
 * what the first version of the card read; new callers use `byKind`, which
 * carries every kind including the ones that are zero. */
export const TopUser = z.object({
  username: z.string(),
  /** Absent for a play recorded against no account. */
  userId: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  plays: z.number(),
  watchedMs: z.number(),
  filmsMs: z.number(),
  tvMs: z.number(),
  byKind: WatchTotals.nullish(),
});
export type TopUser = z.infer<typeof TopUser>;

/** A live playback session, serialized for the admin dashboard. `id` is the
 * opaque session id; `userId`/`itemId` carry branded ids. */
export const PlaybackSession = z.object({
  id: z.string(),
  userId: UserId.nullish(),
  username: z.string(),
  itemId: ItemId,
  title: z.string(),
  year: z.number().nullable(),
  kind: z.string(),
  showTitle: z.string().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  videoLabel: z.string(),
  audioLabel: z.string(),
  subtitle: z.string(),
  bitrate: z.number(),
  mode: z.string(),
  player: z.string(),
  device: z.string(),
  network: z.string(),
  ip: z.string(),
  state: z.string(),
  positionMs: z.number(),
  bufferedMs: z.number().nullish(),
  durationMs: z.number().nullable(),
  startedAt: z.number(),
});
export type PlaybackSession = z.infer<typeof PlaybackSession>;

/** A registration invitation created by a user with `users.manage`. `createdBy`
 * is a nullable display string, not a branded id. */
export const Invite = z.object({
  token: z.string(),
  permissions: z.array(Permission),
  createdBy: z.string().nullish(),
  createdAt: z.string(),
  expiresAt: z.number(),
  used: z.boolean(),
});
export type Invite = z.infer<typeof Invite>;

/** `POST /api/invites` result the invite plus a ready-to-share join URL. */
export const InviteCreated = z.object({
  token: z.string(),
  url: z.string().nullable(),
  permissions: z.array(Permission),
  expiresAt: z.number(),
});
export type InviteCreated = z.infer<typeof InviteCreated>;

/** One line of the server's in-memory log ring (`GET /api/admin/logs`). */
export const LogEntry = z.object({
  seq: z.number(),
  ts: z.number(),
  level: z.string(),
  target: z.string(),
  source: z.string(),
  message: z.string(),
});
export type LogEntry = z.infer<typeof LogEntry>;

/** `GET /api/admin/logs` recent lines (newest last) + the sources present. */
export const LogsView = z.object({
  entries: z.array(LogEntry),
  sources: z.array(z.string()),
});
export type LogsView = z.infer<typeof LogsView>;

/** One image previously uploaded for a notification. `uploadedAt` is epoch
 * milliseconds of the stored file's mtime. */
export const NotificationImage = z.object({
  name: z.string(),
  url: z.string(),
  uploadedAt: z.number(),
  bytes: z.number(),
});
export type NotificationImage = z.infer<typeof NotificationImage>;

/** `GET /api/admin/notifications/images` newest first, capped server-side. */
export const NotificationImages = z.object({
  images: z.array(NotificationImage),
});
export type NotificationImages = z.infer<typeof NotificationImages>;
