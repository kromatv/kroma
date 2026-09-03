import { z } from 'zod';
import { ItemId, VideoTrack } from '../media';
import { IndexerId, RequestId, WantedId } from './ids';
import { EpisodeRef, RequestCoverage, RequestKind } from './schemas';

/** One row of a request's wanted ledger: exactly what a search can be aimed at,
 * and what state that piece is in. `status` is an open string
 * (`wanted` | `grabbed` | `available`). */
export const WantedEntry = z.object({
  id: WantedId,
  season: z.number().nullable(),
  episode: z.number().nullable(),
  airDate: z.string().nullable(),
  status: z.string(),
});
export type WantedEntry = z.infer<typeof WantedEntry>;

/** One season of the requested title as TMDB knows it. The counts are over the
 * whole season: `requested` is how much of it the request covers, `onDisk` how
 * much the library already holds. */
export const LedgerSeason = z.object({
  season: z.number(),
  name: z.string().nullable(),
  airDate: z.string().nullable(),
  episodeCount: z.number(),
  requested: z.number(),
  onDisk: z.number(),
});
export type LedgerSeason = z.infer<typeof LedgerSeason>;

/** One episode as TMDB describes it, joined with what the request and the
 * library know. `wantedId` is null for an episode the request does not cover: it
 * can still be searched, it is simply not tracked. */
export const LedgerEpisode = EpisodeRef.extend({
  name: z.string().nullable(),
  overview: z.string().nullable(),
  airDate: z.string().nullable(),
  stillUrl: z.string().nullable(),
  rating: z.number().nullable(),
  onDisk: z.boolean(),
  wantedId: WantedId.nullable(),
  wantedStatus: z.string().nullable(),
  itemId: ItemId.nullable(),
  video: VideoTrack.nullable(),
  durationMs: z.number().nullable(),
});
export type LedgerEpisode = z.infer<typeof LedgerEpisode>;

/** `GET /api/requests/:id/ledger`. `today` is the server's UTC date, so the
 * client dates "unaired" against the clock the search gate uses. `onDisk` and
 * `airDate` answer for a movie request; a show answers per episode. */
export const RequestLedgerView = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  today: z.string(),
  coverage: RequestCoverage,
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  overview: z.string().nullable(),
  seasons: z.array(LedgerSeason),
  localId: z.string().nullable(),
  onDisk: z.boolean(),
  airDate: z.string().nullable(),
});
export type RequestLedgerView = z.infer<typeof RequestLedgerView>;

/** `GET /api/requests/:id/ledger/:season`. */
export const SeasonLedgerView = z.object({
  season: z.number(),
  episodes: z.array(LedgerEpisode),
});
export type SeasonLedgerView = z.infer<typeof SeasonLedgerView>;

/** What one release search covers. `all` is the whole request; the others
 * narrow it to the one thing the admin pointed at, so a ten-season show is not
 * swept end to end when only S03E07 is wanted. */
export const SearchScope = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('all') }),
  z.object({ scope: z.literal('movie') }),
  z.object({ scope: z.literal('season'), season: z.number().int().nonnegative() }),
  z.object({
    scope: z.literal('episode'),
    season: z.number().int().nonnegative(),
    episode: z.number().int().positive(),
  }),
]);
export type SearchScope = z.infer<typeof SearchScope>;

/** `POST /api/requests/:id/grab` body. `guid` is an opaque release id; the
 * scope must match the search that listed it. */
export const GrabBody = z.intersection(
  z.object({
    guid: z.string(),
    indexerId: IndexerId,
  }),
  SearchScope,
);
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
  upgrade: z.boolean(),
  detailsUrl: z.string().nullable(),
});
export type ScoredReleaseView = z.infer<typeof ScoredReleaseView>;

/** What one indexer made of a sweep. Every enabled indexer answers, whether it
 * found something, found nothing, or failed: `error` is what separates the last
 * two. `elapsedMs` is that indexer's own round trip, not the sweep's. */
export const IndexerReport = z.object({
  id: IndexerId,
  name: z.string(),
  found: z.number(),
  error: z.string().nullable(),
  elapsedMs: z.number(),
});
export type IndexerReport = z.infer<typeof IndexerReport>;

/** The `download.progress` frame a download engine streams over `/api/events`.
 * Not part of core's `ServerEvent` union (module vocabulary stays out of core),
 * but declared here because the frame crosses the SHARED socket: a listener
 * widens it with `new KromaEvents<ServerEvent | DownloadProgressEvent>()`, and
 * both halves must agree on one shape. `requestId` links a download back to the
 * request that grabbed it. */
export const DownloadProgressEvent = z.object({
  type: z.literal('download.progress'),
  id: z.string(),
  requestId: RequestId.nullable(),
  progress: z.number(),
  downBps: z.number(),
  upBps: z.number(),
  peers: z.number(),
  peersSeen: z.number(),
  state: z.string(),
});
export type DownloadProgressEvent = z.infer<typeof DownloadProgressEvent>;

/** `GET /api/requests/:id/search`. */
export const InteractiveSearchView = z.object({
  releases: z.array(ScoredReleaseView),
  indexers: z.array(IndexerReport),
});
export type InteractiveSearchView = z.infer<typeof InteractiveSearchView>;
