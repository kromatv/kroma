// Runtime schemas for the media / catalogue domain, mirroring the ts-rs
// generated wire types (see `../generated`, the single source of truth).
// Same conventions as `./accounts.ts`; `./drift` explains the guards.

import { z } from 'zod';
import { ItemId, LibraryId, ShowId } from './ids';

export const MediaKind = z.enum(['movie', 'episode', 'video']);

export const MarkerKind = z.enum(['intro', 'credits']);

export const LibraryKind = z.enum(['movies', 'shows', 'mixed']);

export const Category = z.enum([
  'maintenance',
  'library',
  'recommendations',
  'pipeline',
  'acquisition',
]);

export const VideoTrack = z.object({
  codec: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  hdr: z.boolean(),
  bitDepth: z.number().nullable(),
});
export type VideoTrack = z.infer<typeof VideoTrack>;

export const AudioTrack = z.object({
  index: z.number(),
  codec: z.string(),
  channels: z.number().nullable(),
  language: z.string().nullable(),
  title: z.string().nullish(),
  default: z.boolean(),
});
export type AudioTrack = z.infer<typeof AudioTrack>;

export const AudioVerdict = z.enum(['ok', 'highDynamics', 'quietDialog']);

/** EBU R128 loudness measurement of an item's default audio track: `lufsI` and
 * `dialogLufs` in LUFS, `lra` in LU, `truePeak` in dBTP. */
export const AudioAnalysis = z.object({
  lufsI: z.number(),
  lra: z.number(),
  truePeak: z.number(),
  dialogLufs: z.number().nullish(),
  verdict: AudioVerdict,
});
export type AudioAnalysis = z.infer<typeof AudioAnalysis>;

export const SubtitleTrack = z.object({
  language: z.string().nullable(),
  codec: z.string(),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrack>;

/** One physical file backing a logical [`MediaItem`]. `id` is a `short_hash` of
 * the absolute path, not a media-item id. */
export const MediaFile = z.object({
  id: z.string(),
  relPath: z.string().nullable(),
  container: z.string(),
  durationMs: z.number().nullable(),
  video: VideoTrack.nullable(),
  audio: AudioTrack.nullable(),
  audioTracks: z.array(AudioTrack),
  subtitles: z.array(SubtitleTrack),
  size: z.number().nullable(),
  edition: z.string().nullish(),
  probed: z.boolean(),
});
export type MediaFile = z.infer<typeof MediaFile>;

export const Marker = z.object({
  kind: MarkerKind,
  startMs: z.number(),
  endMs: z.number(),
});
export type Marker = z.infer<typeof Marker>;

export const CastMember = z.object({
  name: z.string(),
  tmdbId: z.number().nullish(),
  character: z.string().nullish(),
  profileUrl: z.string().nullish(),
});
export type CastMember = z.infer<typeof CastMember>;

export const CrewMember = z.object({
  name: z.string(),
  tmdbId: z.number().nullish(),
  job: z.string(),
  profileUrl: z.string().nullish(),
});
export type CrewMember = z.infer<typeof CrewMember>;

export const Metadata = z.object({
  provider: z.string(),
  tmdbId: z.number(),
  imdbId: z.string().nullish(),
  title: z.string().nullable(),
  tagline: z.string().nullish(),
  overview: z.string().nullable(),
  releaseDate: z.string().nullish(),
  genres: z.array(z.string()),
  tmdbGenreIds: z.array(z.number()).nullish(),
  rating: z.number().nullish(),
  posterUrl: z.string().nullish(),
  backdropUrl: z.string().nullish(),
  logoUrl: z.string().nullish(),
  themeUrl: z.string().nullish(),
  cast: z.array(CastMember).nullish(),
  crew: z.array(CrewMember).nullish(),
  tmdbUrl: z.string(),
});
export type Metadata = z.infer<typeof Metadata>;

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

export const MediaItem = z.object({
  id: ItemId,
  title: z.string(),
  kind: MediaKind,
  year: z.number().nullable(),
  durationMs: z.number().nullable(),
  container: z.string(),
  video: VideoTrack.nullable(),
  audio: AudioTrack.nullable(),
  audioTracks: z.array(AudioTrack),
  subtitles: z.array(SubtitleTrack),
  library: z.string(),
  showId: ShowId.nullable(),
  showTitle: z.string().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  episodeEnd: z.number().nullable(),
  episodeTitle: z.string().nullable(),
  relPath: z.string().nullable(),
  addedAt: z.string(),
  metadata: Metadata.nullish(),
  files: z.array(MediaFile),
  defaultFileId: z.string().nullish(),
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
export const Show = z.object({
  id: ShowId,
  title: z.string(),
  year: z.number().nullable(),
  library: z.string(),
  seasonCount: z.number(),
  episodeCount: z.number(),
  video: VideoTrack.nullable(),
  addedAt: z.string(),
  metadata: Metadata.nullish(),
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

export const ProgressEntry = z.object({
  itemId: ItemId,
  positionMs: z.number(),
  durationMs: z.number().nullable(),
  updatedAt: z.string(),
});
export type ProgressEntry = z.infer<typeof ProgressEntry>;

export const ContinueItem = z.object({
  item: MediaItem,
  positionMs: z.number(),
  durationMs: z.number().nullable(),
  updatedAt: z.string(),
});
export type ContinueItem = z.infer<typeof ContinueItem>;

/** `GET /api/shows/:id/up-next`. */
export const UpNext = z.object({
  item: MediaItem,
  resume: z.boolean(),
});
export type UpNext = z.infer<typeof UpNext>;

// drift: runtime-checked (tagged union)
export const SectionItem = z.discriminatedUnion('type', [
  z.object({ type: z.literal('movie'), item: MediaItem }),
  z.object({ type: z.literal('show'), show: Show }),
]);
export type SectionItem = z.infer<typeof SectionItem>;

export const Section = z.object({
  id: z.string(),
  title: z.string(),
  reason: z.string().nullish(),
  items: z.array(SectionItem),
});
export type Section = z.infer<typeof Section>;

export const Treatment = z.object({
  key: z.string(),
  status: z.string(),
  error: z.string().nullish(),
});
export type Treatment = z.infer<typeof Treatment>;

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
export type Category = z.infer<typeof Category>;
export type LibraryKind = z.infer<typeof LibraryKind>;
export type AudioVerdict = z.infer<typeof AudioVerdict>;
export type MarkerKind = z.infer<typeof MarkerKind>;
export type MediaKind = z.infer<typeof MediaKind>;
