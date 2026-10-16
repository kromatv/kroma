import { z } from 'zod';
import { EpisodeRef, RequestKind } from '../requests';

/** When a monitored film becomes worth searching for. */
export const MinAvailability = z.enum(['announced', 'inCinemas', 'released']);
export type MinAvailability = z.infer<typeof MinAvailability>;

/** Which episodes of a show start out monitored. Applied once; each episode can
 * be switched on its own afterwards. */
export const MonitorPreset = z.enum([
  'all',
  'future',
  'missing',
  'existing',
  'firstSeason',
  'latestSeason',
  'pilot',
  'none',
]);
export type MonitorPreset = z.infer<typeof MonitorPreset>;

/** A title the server wants to hold. For a show, `seasons` are the seasons
 * whose newly announced episodes join, and `monitorNewSeasons` adds a season
 * TMDB announces later. `originalLanguage` is a tag (`en`, `fr-CA`). */
export const MonitoredTitle = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  seasons: z.array(z.number()),
  monitorNewSeasons: z.boolean(),
  minAvailability: MinAvailability,
  addedBy: z.string().nullable(),
  addedAt: z.number(),
  updatedAt: z.number(),
  originalLanguage: z.string().nullable(),
  airStatus: z.string().nullable(),
  aliases: z.array(z.string()).default([]),
});
export type MonitoredTitle = z.infer<typeof MonitoredTitle>;

/** A monitored title with its ledger tallied: `missing` counts aired units
 * still wanted, `grabbed` those on their way. */
export const MonitoredSummary = MonitoredTitle.extend({
  monitored: z.number(),
  available: z.number(),
  missing: z.number(),
  grabbed: z.number(),
});
export type MonitoredSummary = z.infer<typeof MonitoredSummary>;

/** `PUT /api/monitoring/:kind/:tmdbId` body. Absent fields keep what the title
 * has; a show monitored for the first time with no preset takes `all`. */
export const MonitorBody = z.object({
  preset: MonitorPreset.optional(),
  monitorNewSeasons: z.boolean().optional(),
  minAvailability: MinAvailability.optional(),
  searchNow: z.boolean().optional(),
});
export type MonitorBody = z.infer<typeof MonitorBody>;

/** A title by its TMDB identity. */
export const TitleRef = z.object({ kind: RequestKind, tmdbId: z.number() });
export type TitleRef = z.infer<typeof TitleRef>;

/** `PUT /api/monitoring/show/:tmdbId/episodes` body. A season switched on also
 * takes the episodes TMDB announces in it later. */
export const EpisodeMonitoringBody = z.object({
  seasons: z.array(z.object({ season: z.number(), monitored: z.boolean() })).optional(),
  episodes: z.array(EpisodeRef.extend({ monitored: z.boolean() })).optional(),
});
export type EpisodeMonitoringBody = z.infer<typeof EpisodeMonitoringBody>;

/** `POST /api/monitoring/bulk` answer: how many titles were set, and why each
 * other one could not be. */
export const BulkMonitorResult = z.object({
  monitored: z.number(),
  failed: z.array(TitleRef.extend({ error: z.string() })),
});
export type BulkMonitorResult = z.infer<typeof BulkMonitorResult>;
