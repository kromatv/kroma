import { z } from 'zod';
import { CastMember, CrewMember } from '../media';
import { RequestId, RequestKind, RequestStatus } from '../requests';

/** TMDB namespace filter for a discovery search. */
export const DiscoverType = z.enum(['movie', 'tv', 'all']);
export type DiscoverType = z.infer<typeof DiscoverType>;

/** The route vocabulary a TMDB detail is fetched under, which is TMDB's split
 * rather than the catalog's. */
export const TmdbKind = DiscoverType.exclude(['all']);
export type TmdbKind = z.infer<typeof TmdbKind>;

/** One TMDB title as the request flow sees it: what the provider knows plus
 * what this library and this account's requests already cover. */
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
export const DiscoverDetail = DiscoverEntry.extend({
  tagline: z.string().nullable(),
  genres: z.array(z.string()),
  tmdbGenreIds: z.array(z.number()).nullish(),
  runtimeMin: z.number().nullable(),
  seasons: z.array(DiscoverSeason),
  cast: z.array(CastMember),
  crew: z.array(CrewMember),
  similar: z.array(DiscoverEntry),
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
