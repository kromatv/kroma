// This module's wire types: the download queue and the clients behind it.
// `@kroma/core` models neither: a module owns the shape of its own API. The
// queue carries the VPN module's status when that module is installed, which is
// why this imports it by package name (see `optionalDependencies`).

import { brandedId, ItemId, RequestId } from '@kroma/module-sdk';
import { VpnStatusView } from '@kroma/module-vpn/schemas';
import { z } from 'zod';

export const DownloadClientId = brandedId('DownloadClientId');
export type DownloadClientId = z.infer<typeof DownloadClientId>;

/** One configured download client (password write-only). `kind` is an open
 * string on the wire (`rqbit` | `transmission` | `qbittorrent`). */
export const DownloadClientView = z.object({
  id: DownloadClientId,
  kind: z.string(),
  name: z.string(),
  url: z.string(),
  username: z.string(),
  hasPassword: z.boolean(),
  enabled: z.boolean(),
  priority: z.number(),
  createdAt: z.number(),
  builtin: z.boolean(),
  state: z.enum(['ready', 'starting', 'stopped', 'notCompiled', 'unknown']).catch('unknown'),
  startingForMs: z.number().nullable().catch(null),
});
export type DownloadClientView = z.infer<typeof DownloadClientView>;

/** `GET /download-clients`. */
export const DownloadClientsView = z.object({
  clients: z.array(DownloadClientView),
  rqbitCompiled: z.boolean(),
});
export type DownloadClientsView = z.infer<typeof DownloadClientsView>;

/** `POST /download-clients/:id/test` result. */
export const ClientTestResult = z.object({
  ok: z.boolean(),
  version: z.string().nullable(),
  error: z.string().nullable(),
});
export type ClientTestResult = z.infer<typeof ClientTestResult>;

/** Create/update body for a download client (all fields optional patch). */
export const SaveDownloadClientBody = z.object({
  kind: z.string().nullable(),
  name: z.string().nullable(),
  url: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  enabled: z.boolean().nullable(),
  priority: z.number().nullable(),
});
export type SaveDownloadClientBody = z.infer<typeof SaveDownloadClientBody>;

/** How a download's title was decided. `pinned` stops the automatic pass looking
 * again; `none` is it having looked and found nothing, which null (a row it has
 * not reached yet) is not. */
export const MatchSource = z.enum(['auto', 'pinned', 'none']);
export type MatchSource = z.infer<typeof MatchSource>;

/** One download (grab) in the admin queue. `id` is a download-row id (no brand);
 * `infoHash` is an opaque torrent hash. `localId` is the catalog item once
 * imported. `kind`/`status` are open strings on the wire. */
export const DownloadView = z.object({
  id: z.string(),
  clientId: DownloadClientId,
  clientName: z.string(),
  requestId: RequestId.nullable(),
  kind: z.string(),
  title: z.string(),
  releaseTitle: z.string(),
  season: z.number().nullable(),
  episodes: z.array(z.number()).nullable(),
  status: z.string(),
  progress: z.number(),
  // Live engine stats (0 when not active/known), polled into the response so the
  // panel shows speed + peers even without the live WebSocket event stream.
  downBps: z.number(),
  upBps: z.number(),
  peers: z.number(),
  peersSeen: z.number(),
  sizeBytes: z.number().nullable(),
  score: z.number().nullable(),
  error: z.string().nullable(),
  grabbedAt: z.number(),
  completedAt: z.number().nullable(),
  importedAt: z.number().nullable(),
  indexerName: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  infoHash: z.string().nullable(),
  posterUrl: z.string().nullable(),
  localId: ItemId.nullable(),
  year: z.number().nullable(),
  tmdbId: z.number().nullable(),
  matchSource: MatchSource.nullable(),
  lifetimeDownloadedBytes: z.number(),
  lifetimeUploadedBytes: z.number(),
});
export type DownloadView = z.infer<typeof DownloadView>;

/** Where the returned page sits in the filtered ledger. */
export const PageView = z.object({
  page: z.number(),
  perPage: z.number(),
  total: z.number(),
  pageCount: z.number(),
});
export type PageView = z.infer<typeof PageView>;

/** One throughput sample, oldest first. */
export const SpeedSample = z.object({
  atMs: z.number(),
  downBps: z.number(),
  upBps: z.number(),
  active: z.number(),
  peers: z.number(),
});
export type SpeedSample = z.infer<typeof SpeedSample>;

/** The queue's headline numbers: what is moving now, what has moved ever. */
export const DownloadStatsView = z.object({
  downBps: z.number(),
  upBps: z.number(),
  peers: z.number(),
  active: z.number(),
  // Row count per status across the WHOLE ledger, so a filter chip can say how
  // many rows it would reveal.
  byStatus: z.record(z.string(), z.number()),
  totalDownloadedBytes: z.number(),
  totalUploadedBytes: z.number(),
  history: z.array(SpeedSample),
});
export type DownloadStatsView = z.infer<typeof DownloadStatsView>;

/** `GET /downloads`. */
export const DownloadsView = z.object({
  downloads: z.array(DownloadView),
  vpn: VpnStatusView.nullable(),
  page: PageView,
  stats: DownloadStatsView,
});
export type DownloadsView = z.infer<typeof DownloadsView>;

export const DownloadSort = z.enum(['release', 'progress', 'status', 'added']);
export type DownloadSort = z.infer<typeof DownloadSort>;

export const SortDirection = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof SortDirection>;

/** How the queue is narrowed. Everything is optional; an empty query is the
 * whole ledger, newest first. */
export interface DownloadQuery {
  page?: number;
  perPage?: number;
  /** A group (`active` | `done` | `failed` | `all`) or one exact status. */
  status?: string;
  clientId?: string;
  kind?: string;
  q?: string;
  unlinked?: boolean;
  sort?: DownloadSort;
  dir?: SortDirection;
}

export const BulkActionResult = z.object({
  count: z.number(),
});
export type BulkActionResult = z.infer<typeof BulkActionResult>;

/** The engine-wide ceilings. `0` is unlimited in every field. */
export const LimitsView = z.object({
  downKbps: z.number(),
  upKbps: z.number(),
  maxActive: z.number(),
});
export type LimitsView = z.infer<typeof LimitsView>;

/** One title a download could be for, ranked best first. */
export const MatchCandidateView = z.object({
  tmdbId: z.number(),
  kind: z.string(),
  title: z.string(),
  year: z.number().nullable(),
  overview: z.string().nullable(),
  posterUrl: z.string().nullable(),
  // 0..1, from the same ranking the automatic pass uses.
  score: z.number(),
});
export type MatchCandidateView = z.infer<typeof MatchCandidateView>;

/** `GET /downloads/:id/candidates`. */
export const MatchCandidatesView = z.object({
  query: z.string(),
  kind: z.string(),
  year: z.number().nullable(),
  currentTmdbId: z.number().nullable(),
  // The current title was chosen by an operator, not resolved automatically.
  pinned: z.boolean(),
  results: z.array(MatchCandidateView),
});
export type MatchCandidatesView = z.infer<typeof MatchCandidatesView>;

/** `PUT /downloads/:id/link` body: the title to pin the row to. */
export interface LinkBody {
  /** `movie` | `season` | `episode`. */
  kind: string;
  tmdbId: number;
  title?: string | null;
  year?: number | null;
  season?: number | null;
  episodes?: number[] | null;
}

/** One episode of a season, as the provider names it. Everything but the number
 * is optional: a season that has aired carries it all, one that has not may
 * carry only a title. */
export const EpisodeInfo = z.object({
  episode: z.number(),
  name: z.string().nullable(),
  overview: z.string().nullable(),
  airDate: z.string().nullable(),
  stillUrl: z.string().nullable(),
});
export type EpisodeInfo = z.infer<typeof EpisodeInfo>;

export const EpisodeInfoList = z.array(EpisodeInfo);
export type EpisodeInfoList = z.infer<typeof EpisodeInfoList>;

/** `POST /downloads/torrent`: what an uploaded `.torrent` says about itself, in
 * the shape the manual-add flow already speaks. Queues nothing. */
export const InspectedTorrent = z.object({
  magnet: z.string(),
  infoHash: z.string(),
  releaseTitle: z.string(),
  sizeBytes: z.number(),
  kind: z.string(),
  title: z.string().nullable(),
  year: z.number().nullable(),
  season: z.number().nullable(),
  episodes: z.array(z.number()).nullable(),
});
export type InspectedTorrent = z.infer<typeof InspectedTorrent>;

/** Example rendered names for the live preview. */
export const SampleNames = z.object({
  movie: z.string(),
  episode: z.string(),
});
export type SampleNames = z.infer<typeof SampleNames>;

/** The five naming templates plus the global case transform. */
export const NamingTemplatesView = z.object({
  movieFolder: z.string(),
  movieFile: z.string(),
  seriesFolder: z.string(),
  seasonFolder: z.string(),
  episodeFile: z.string(),
  case: z.string(),
});
export type NamingTemplatesView = z.infer<typeof NamingTemplatesView>;

/** `GET /organize/naming` current templates + a rendered sample. */
export const NamingView = z.object({
  templates: NamingTemplatesView,
  sample: SampleNames,
});
export type NamingView = z.infer<typeof NamingView>;

/** One file the rename tool would move. */
export const OrganizeMove = z.object({
  title: z.string(),
  kind: z.string(),
  from: z.string(),
  to: z.string(),
});
export type OrganizeMove = z.infer<typeof OrganizeMove>;

/** `GET /organize/preview`. */
export const OrganizePlan = z.object({
  moves: z.array(OrganizeMove),
  totalFiles: z.number(),
  matching: z.number(),
});
export type OrganizePlan = z.infer<typeof OrganizePlan>;

/** `POST /organize/apply` result. */
export const OrganizeResult = z.object({
  moved: z.number(),
  failed: z.number(),
  errors: z.array(z.string()),
});
export type OrganizeResult = z.infer<typeof OrganizeResult>;

// The frame this module streams is declared in `@kroma/core`: it crosses the
// shared `/api/events` socket, so its shape is a contract with every listener
// rather than this package's private business. Re-exported so a caller reaching
// for it here still finds it.
export type { DownloadProgressEvent } from '@kroma/core';

export interface DownloadCompletedEvent {
  type: 'download.completed';
  id: string;
  title: string;
}

export interface DownloadStatsEvent {
  type: 'downloads.stats';
  downBps: number;
  upBps: number;
  active: number;
  peers: number;
}
