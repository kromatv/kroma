// This module's wire types: what a manual grab searches, analyses and adds.
// They live here rather than in `@kroma/core`, which has no business knowing
// what a torrent is.

import { z } from 'zod';

/** One file inside an analyzed torrent, with its detected season/episode. */
export const TorrentFileView = z.object({
  index: z.number(),
  path: z.string(),
  sizeBytes: z.number(),
  isVideo: z.boolean(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
});
export type TorrentFileView = z.infer<typeof TorrentFileView>;

/** `POST /analyze` result. `kind` is an open string
 * (`movie` | `episode` | `season` | `series` | `unknown`). */
export const TorrentAnalysis = z.object({
  kind: z.string(),
  seasons: z.array(z.number()),
  files: z.array(TorrentFileView),
});
export type TorrentAnalysis = z.infer<typeof TorrentAnalysis>;

/** `POST /add` body. `tmdbId` is a foreign numeric id. */
export const ManualAddBody = z.object({
  magnetOrUrl: z.string(),
  kind: z.string(),
  title: z.string().nullable(),
  year: z.number().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  tmdbId: z.number().nullable(),
  onlyFiles: z.array(z.number()).nullable(),
  detailsUrl: z.string().nullable(),
});
export type ManualAddBody = z.infer<typeof ManualAddBody>;

/** One release from a free-text manual indexer search. `guid` is an opaque
 * release id. */
export const ManualReleaseView = z.object({
  title: z.string(),
  guid: z.string(),
  indexerName: z.string(),
  downloadUrl: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  seeders: z.number().nullable(),
  leechers: z.number().nullable(),
  publishedAt: z.string().nullable(),
  resolution: z.string().nullable(),
  codec: z.string().nullable(),
  source: z.string().nullable(),
  parsedTitle: z.string(),
  year: z.number().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  fullSeason: z.boolean(),
  detailsUrl: z.string().nullable(),
});
export type ManualReleaseView = z.infer<typeof ManualReleaseView>;

/** `POST /search` body. */
export const ManualSearchBody = z.object({
  query: z.string(),
});
export type ManualSearchBody = z.infer<typeof ManualSearchBody>;

/** `POST /search`. */
export const ManualSearchView = z.object({
  releases: z.array(ManualReleaseView),
  indexerErrors: z.array(z.string()),
});
export type ManualSearchView = z.infer<typeof ManualSearchView>;
