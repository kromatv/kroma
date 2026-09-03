import { z } from 'zod';
import { CastMember, Metadata } from './credits';
import { ItemId, LibraryId, MediaFileId, ShowId } from './ids';
import { AudioAnalysis, Marker, MediaFile, Tracks, VideoTrack } from './tracks';

export const MediaKind = z.enum(['movie', 'episode', 'video']);
export type MediaKind = z.infer<typeof MediaKind>;

export const LibraryKind = z.enum(['movies', 'shows', 'mixed']);
export type LibraryKind = z.infer<typeof LibraryKind>;

/** One TMDB title offered by the "fix the match" picker. `score` is the
 * matcher's 0..1 confidence against what the filename parsed to. */
export const MatchCandidate = z.object({
  tmdbId: z.number(),
  title: z.string(),
  originalTitle: z.string().nullish(),
  year: z.number().nullish(),
  posterUrl: z.string().nullish(),
  overview: z.string().nullish(),
  rating: z.number().nullish(),
  score: z.number(),
  current: z.boolean(),
});
export type MatchCandidate = z.infer<typeof MatchCandidate>;

/** Route vocabulary for a rematch: the catalog's split, not TMDB's `tv`. */
export const RematchKind = z.enum(['movie', 'show']);
export type RematchKind = z.infer<typeof RematchKind>;

/** `GET /api/rematch/{kind}/{id}/candidates`. `pinned` means an operator chose
 * the current match, so there is a pin to reset. */
export const MatchCandidates = z.object({
  query: z.string(),
  year: z.number().nullish(),
  currentTmdbId: z.number().nullish(),
  pinned: z.boolean(),
  results: z.array(MatchCandidate),
});
export type MatchCandidates = z.infer<typeof MatchCandidates>;

const CatalogEntry = z.object({
  title: z.string(),
  year: z.number().nullable(),
  library: LibraryId,
  video: VideoTrack.nullable(),
  addedAt: z.string(),
  metadata: Metadata.nullish(),
});

export const MediaItem = CatalogEntry.extend(Tracks.shape).extend({
  id: ItemId,
  kind: MediaKind,
  showId: ShowId.nullable(),
  showTitle: z.string().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  episodeEnd: z.number().nullable(),
  episodeTitle: z.string().nullable(),
  files: z.array(MediaFile),
  defaultFileId: MediaFileId.nullish(),
  markers: z.array(Marker).nullish(),
  audioAnalysis: AudioAnalysis.nullish(),
});
export type MediaItem = z.infer<typeof MediaItem>;

/** Episodes are sorted by episode number. */
export const Season = z.object({
  number: z.number(),
  episodes: z.array(MediaItem),
  cast: z.array(CastMember).nullish(),
});
export type Season = z.infer<typeof Season>;

/** A TV show aggregate (not a file), built by grouping episodes during a scan. */
export const Show = CatalogEntry.extend({
  id: ShowId,
  seasonCount: z.number(),
  episodeCount: z.number(),
  progress: z.number().nullish(),
});
export type Show = z.infer<typeof Show>;

/** `GET /api/shows/:id`. */
export const ShowDetail = z.object({
  show: Show,
  seasons: z.array(Season),
});
export type ShowDetail = z.infer<typeof ShowDetail>;

export const Library = z.object({
  id: LibraryId,
  name: z.string(),
  kind: LibraryKind,
  path: z.string(),
  itemCount: z.number(),
});
export type Library = z.infer<typeof Library>;

const Resume = z.object({
  positionMs: z.number(),
  durationMs: z.number().nullable(),
  updatedAt: z.string(),
});

export const ProgressEntry = Resume.extend({ itemId: ItemId });
export type ProgressEntry = z.infer<typeof ProgressEntry>;

export const ContinueItem = Resume.extend({ item: MediaItem });
export type ContinueItem = z.infer<typeof ContinueItem>;

/** `GET /api/shows/:id/up-next`. */
export const UpNext = z.object({
  item: MediaItem,
  resume: z.boolean(),
});
export type UpNext = z.infer<typeof UpNext>;

export const MovieHit = z.object({ type: z.literal('movie'), item: MediaItem });
export const ShowHit = z.object({ type: z.literal('show'), show: Show });
export const EpisodeHit = z.object({ type: z.literal('episode'), item: MediaItem });

export const SectionItem = z.discriminatedUnion('type', [MovieHit, ShowHit]);
export type SectionItem = z.infer<typeof SectionItem>;

export const Section = z.object({
  id: z.string(),
  title: z.string(),
  reason: z.string().nullish(),
  items: z.array(SectionItem),
});
export type Section = z.infer<typeof Section>;

/** `GET /api/health`. */
export const Health = z.object({
  status: z.string(),
  name: z.string().optional(),
  instanceId: z.string().optional(),
  version: z.string(),
  ffprobe: z.boolean(),
  libraries: z.number(),
  items: z.number(),
  shows: z.number(),
});
export type Health = z.infer<typeof Health>;

/** `GET /api/splash`: one cover of the anonymous sign-in slideshow. */
export const SplashEntry = z.object({
  kind: z.string(),
  title: z.string(),
  year: z.number().nullable(),
  backdropUrl: z.string(),
  rating: z.number().nullish(),
});
export type SplashEntry = z.infer<typeof SplashEntry>;

export const ServerInfo = z.object({
  name: z.string(),
  hostname: z.string(),
  version: z.string(),
  uptimeSec: z.number(),
  online: z.boolean(),
  sessions: z.number(),
});
export type ServerInfo = z.infer<typeof ServerInfo>;
