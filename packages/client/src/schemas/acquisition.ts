// What the core request flow needs to grab a release: the interactive search
// results and the grab body. How an indexer or a download client is CONFIGURED
// belongs to the modules that own those, not here: an indexer id is carried as
// an opaque brand, nothing more.

import { z } from 'zod';
import { IndexerId } from './ids';

/** `POST /api/requests/:id/grab` body. `guid` is an opaque release id. */
export const GrabBody = z.object({
  guid: z.string(),
  indexerId: IndexerId,
});
export type GrabBody = z.infer<typeof GrabBody>;

/** One score-explanation line. */
export const ScoreLineView = z.object({
  rule: z.string(),
  delta: z.number(),
  note: z.string(),
});
export type ScoreLineView = z.infer<typeof ScoreLineView>;

/** One scored release from an interactive search. `guid` is an opaque release
 * id; `target` is an open string (`movie` | `episode` | `season`). */
export const ScoredReleaseView = z.object({
  title: z.string(),
  guid: z.string(),
  indexerId: IndexerId,
  indexerName: z.string(),
  sizeBytes: z.number().nullable(),
  seeders: z.number().nullable(),
  leechers: z.number().nullable(),
  publishedAt: z.string().nullable(),
  target: z.string(),
  season: z.number().nullable(),
  episodes: z.array(z.number()).nullable(),
  score: z.number().nullable(),
  breakdown: z.array(ScoreLineView),
  rejected: z.string().nullable(),
  grabbable: z.boolean(),
  detailsUrl: z.string().nullable(),
});
export type ScoredReleaseView = z.infer<typeof ScoredReleaseView>;

/** `GET /api/requests/:id/search`. */
export const InteractiveSearchView = z.object({
  releases: z.array(ScoredReleaseView),
  indexerErrors: z.array(z.string()),
});
export type InteractiveSearchView = z.infer<typeof InteractiveSearchView>;
