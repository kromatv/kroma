// Runtime schemas for the discovery / requests / search domain, mirroring the
// ts-rs wire types. Same conventions as `./accounts`.

import { z } from 'zod';
import { RequestId, UserId } from './ids';
import { CastMember, CrewMember, MediaItem, Show } from './media';

export const RequestKind = z.enum(['movie', 'show']);

export const RequestStatus = z.enum([
  'pending',
  'approved',
  'searching',
  'downloading',
  'importing',
  'available',
  'partially_available',
  'failed',
  'denied',
]);

export const RequestCounts = z.object({
  total: z.number(),
  pending: z.number(),
  active: z.number(),
  available: z.number(),
  denied: z.number(),
  failed: z.number(),
});
export type RequestCounts = z.infer<typeof RequestCounts>;

export const EpisodeRef = z.object({
  season: z.number(),
  episode: z.number(),
});
export type EpisodeRef = z.infer<typeof EpisodeRef>;

export const MediaRequest = z.object({
  id: RequestId,
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  seasons: z.array(z.number()).nullable(),
  episodes: z.array(EpisodeRef).nullable(),
  status: RequestStatus,
  requestedBy: UserId.nullable(),
  requestedByName: z.string().nullable(),
  reviewedBy: UserId.nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  progress: z.number().nullable(),
  airStatus: z.string().nullable(),
  nextAirDate: z.string().nullable(),
});
export type MediaRequest = z.infer<typeof MediaRequest>;

/** `GET /api/requests`. */
export const RequestsView = z.object({
  requests: z.array(MediaRequest),
  counts: RequestCounts,
});
export type RequestsView = z.infer<typeof RequestsView>;

/** Shared by `GET /api/requests/calendar` (future-dated, `airDate` always set)
 * and `GET /api/requests/missing` (aired but not on disk, `airDate` may be
 * null). `requestId` is null for a library-scan row nobody requested. */
export const CalendarEntry = z.object({
  requestId: RequestId.nullable(),
  tmdbId: z.number(),
  kind: RequestKind,
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  season: z.number().nullable(),
  episode: z.number().nullable(),
  airDate: z.string().nullable(),
  status: z.string(),
});
export type CalendarEntry = z.infer<typeof CalendarEntry>;

/** `POST /api/requests` body. */
export const CreateRequestBody = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  seasons: z.array(z.number()).nullable(),
  episodes: z.array(EpisodeRef).nullish(),
});
export type CreateRequestBody = z.infer<typeof CreateRequestBody>;

/** `PUT /api/requests/:id/coverage` body: exactly what a show request covers
 * from now on. Both absent/empty means the WHOLE show; otherwise the union of
 * the named seasons and the named episodes. Unlike a second ask, this can narrow
 * as well as widen. */
export const RequestCoverageBody = z.object({
  seasons: z.array(z.number()).nullable(),
  episodes: z.array(EpisodeRef).nullable(),
});
export type RequestCoverageBody = z.infer<typeof RequestCoverageBody>;

export const DiscoverEntry = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  overview: z.string().nullable(),
  rating: z.number().nullable(),
  inLibrary: z.boolean(),
  localId: z.string().nullable(),
  requestId: RequestId.nullable(),
  requestStatus: RequestStatus.nullable(),
  requestProgress: z.number().nullable(),
});
export type DiscoverEntry = z.infer<typeof DiscoverEntry>;

export const DiscoverSeason = z.object({
  season: z.number(),
  name: z.string().nullable(),
  episodeCount: z.number(),
  airDate: z.string().nullable(),
  available: z.boolean(),
  episodesAvailable: z.number(),
  requested: z.boolean(),
});
export type DiscoverSeason = z.infer<typeof DiscoverSeason>;

/** `GET /api/discover/{movie,tv}/:tmdbId`. */
export const DiscoverDetail = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  overview: z.string().nullable(),
  tagline: z.string().nullable(),
  genres: z.array(z.string()),
  tmdbGenreIds: z.array(z.number()).nullish(),
  rating: z.number().nullable(),
  runtimeMin: z.number().nullable(),
  seasons: z.array(DiscoverSeason),
  cast: z.array(CastMember),
  crew: z.array(CrewMember),
  similar: z.array(DiscoverEntry),
  inLibrary: z.boolean(),
  localId: z.string().nullable(),
  requestId: RequestId.nullable(),
  requestStatus: RequestStatus.nullable(),
  requestProgress: z.number().nullable(),
  airStatus: z.string().nullable(),
  nextAirDate: z.string().nullable(),
});
export type DiscoverDetail = z.infer<typeof DiscoverDetail>;

/** `GET /api/discover/search` / `GET /api/discover/trending`. */
export const DiscoverResponse = z.object({
  results: z.array(DiscoverEntry),
  page: z.number(),
  totalPages: z.number(),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponse>;

/** One ranked `GET /api/search` result. */
export const SearchHit = z.discriminatedUnion('type', [
  z.object({ type: z.literal('movie'), item: MediaItem }),
  z.object({ type: z.literal('show'), show: Show }),
  z.object({ type: z.literal('episode'), item: MediaItem }),
]);
// drift: runtime-checked (tagged union)
export type SearchHit = z.infer<typeof SearchHit>;

/** `GET /api/search?q=…`; hits are in descending relevance. */
export const SearchResponse = z.object({
  query: z.string(),
  results: z.array(SearchHit),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

/** One person's provider profile; TMDB fills the optional fields in for the
 * best-known names only. */
export const PersonDetail = z.object({
  tmdbId: z.number(),
  name: z.string(),
  biography: z.string().nullish(),
  birthday: z.string().nullish(),
  deathday: z.string().nullish(),
  placeOfBirth: z.string().nullish(),
  knownFor: z.string().nullish(),
  profileUrl: z.string().nullish(),
  tmdbUrl: z.string(),
});
export type PersonDetail = z.infer<typeof PersonDetail>;

/** A single TMDB credit in a person's combined filmography. */
export const TmdbCredit = z.object({
  tmdbId: z.number(),
  title: z.string(),
  mediaType: z.enum(['movie', 'tv']),
  year: z.number().nullish(),
  posterUrl: z.string().nullish(),
  backdropUrl: z.string().nullish(),
  overview: z.string().nullish(),
  character: z.string().nullish(),
  job: z.string().nullish(),
});
export type TmdbCredit = z.infer<typeof TmdbCredit>;

/** `GET /api/people/details?name=…`, where `name` is a display name or a person
 * slug; `person` is null whenever the provider has nothing to say (no key,
 * unknown name, provider down). `credits` carries the TMDB combined filmography
 * so the page can show titles not in the local library. */
export const PersonDetailResponse = z.object({
  name: z.string(),
  person: PersonDetail.nullish(),
  credits: z.array(TmdbCredit).default([]),
});
export type PersonDetailResponse = z.infer<typeof PersonDetailResponse>;

/** `GET /api/people?name=…`, where `name` is a display name or a person slug.
 * The `name` that comes back is the catalogue's own spelling of whoever it
 * resolved to. */
export const PersonResponse = z.object({
  name: z.string(),
  results: z.array(SearchHit),
});
export type PersonResponse = z.infer<typeof PersonResponse>;
export type RequestKind = z.infer<typeof RequestKind>;
export type RequestStatus = z.infer<typeof RequestStatus>;
