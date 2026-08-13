// This module's wire types: the download queue and the clients behind it.
// `@kroma/core` models neither: a module owns the shape of its own API. The
// queue carries the VPN module's status when that module is installed, which is
// why this imports it by package name (see `optionalDependsOn`).

import { brandedId, ItemId, RequestId } from '@kroma/module-sdk';
import { VpnStatusView } from '@kroma/module-vpn/schemas';
import { z } from 'zod';

export const DownloadClientId = brandedId('DownloadClientId');
export type DownloadClientId = ReturnType<typeof DownloadClientId.of>;

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
});
export type DownloadView = z.infer<typeof DownloadView>;

/** `GET /downloads`. */
export const DownloadsView = z.object({
  downloads: z.array(DownloadView),
  vpn: VpnStatusView.nullable(),
});
export type DownloadsView = z.infer<typeof DownloadsView>;

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
