import { z } from 'zod';
import { UserId } from '../accounts';
import { ItemId, LibraryId, ShowId } from '../media';
import { PlaybackMode, PlaybackSessionId, PlaybackState } from '../playback';

export const WatchKind = z.enum(['movie', 'tv']);
export type WatchKind = z.infer<typeof WatchKind>;

/** Whether a viewer reached the server over the local link or from outside. */
export const NetworkKind = z.enum(['LAN', 'WAN']);
export type NetworkKind = z.infer<typeof NetworkKind>;

/** Milliseconds watched per kind. Every kind is present, zeroes included. */
export const WatchTotals = z.record(WatchKind, z.number());
export type WatchTotals = z.infer<typeof WatchTotals>;

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

/** One finished playback: who watched what, when, and on which device.
 * `inCatalog` is false where the title has left the catalog, so a row does not
 * offer a link into a page that no longer exists; `showId` opens the series
 * rather than one episode and is absent for a film. */
export const PlayEntry = z.object({
  id: z.string(),
  userId: UserId.nullish(),
  username: z.string(),
  itemId: ItemId.nullish(),
  showId: ShowId.nullish(),
  inCatalog: z.boolean().default(true),
  kind: z.string(),
  title: z.string(),
  showTitle: z.string().nullish(),
  season: z.number().nullish(),
  episode: z.number().nullish(),
  device: z.string().nullish(),
  player: z.string().nullish(),
  mode: PlaybackMode.nullish(),
  network: NetworkKind.nullish(),
  videoLabel: z.string().nullish(),
  audioLabel: z.string().nullish(),
  library: LibraryId.nullish(),
  startedAt: z.number(),
  endedAt: z.number(),
  watchedMs: z.number(),
});
export type PlayEntry = z.infer<typeof PlayEntry>;

/** A live playback session, serialized for the admin dashboard. */
export const PlaybackSession = z.object({
  id: PlaybackSessionId,
  userId: UserId.nullish(),
  username: z.string(),
  itemId: ItemId,
  title: z.string(),
  year: z.number().nullable(),
  kind: z.string(),
  showTitle: z.string().nullish(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  videoLabel: z.string(),
  audioLabel: z.string(),
  subtitle: z.string(),
  bitrate: z.number(),
  mode: PlaybackMode,
  player: z.string(),
  device: z.string(),
  network: NetworkKind,
  ip: z.string(),
  state: PlaybackState,
  positionMs: z.number(),
  bufferedMs: z.number().nullish(),
  durationMs: z.number().nullable(),
  startedAt: z.number(),
});
export type PlaybackSession = z.infer<typeof PlaybackSession>;

/** One entry of the history screen's library filter. */
export const HistoryLibrary = z.object({ id: LibraryId, name: z.string() });
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
  itemId: ItemId,
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

/** Aggregated per-user watch stats over a window (dashboard "Top des
 * utilisateurs"). `byKind` carries every kind including the ones that are zero;
 * `filmsMs` and `tvMs` predate it. `userId` is absent for a play recorded
 * against no account. */
export const TopUser = z.object({
  username: z.string(),
  userId: UserId.nullish(),
  avatarUrl: z.string().nullish(),
  plays: z.number(),
  watchedMs: z.number(),
  filmsMs: z.number(),
  tvMs: z.number(),
  byKind: WatchTotals.nullish(),
});
export type TopUser = z.infer<typeof TopUser>;

/** Per-series aggregate over its episodes, for the elements list. */
export const EpStats = z.object({
  episodes: z.number(),
  probed: z.number(),
  storyboarded: z.number(),
  seasons: z.number(),
  markerSeasons: z.number(),
});
export type EpStats = z.infer<typeof EpStats>;
