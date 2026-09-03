import { z } from 'zod';
import { EpisodeHit, MovieHit, ShowHit } from './schemas';

/** One ranked `GET /api/search` result. */
export const SearchHit = z.discriminatedUnion('type', [MovieHit, ShowHit, EpisodeHit]);
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
