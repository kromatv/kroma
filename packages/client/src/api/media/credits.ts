import { z } from 'zod';

const Person = z.object({
  name: z.string(),
  tmdbId: z.number().nullish(),
  profileUrl: z.string().nullish(),
});

export const CastMember = Person.extend({ character: z.string().nullish() });
export type CastMember = z.infer<typeof CastMember>;

export const CrewMember = Person.extend({ job: z.string() });
export type CrewMember = z.infer<typeof CrewMember>;

/**
 * The rating a reader is shown: their country's label, or another country's
 * when theirs never rated the title.
 */
export const AgeRating = z.object({
  label: z.string(),
  country: z.string(),
  borrowed: z.boolean(),
});
export type AgeRating = z.infer<typeof AgeRating>;

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
  certification: z.string().nullish(),
  ageRating: AgeRating.nullish(),
  posterUrl: z.string().nullish(),
  backdropUrl: z.string().nullish(),
  logoUrl: z.string().nullish(),
  themeUrl: z.string().nullish(),
  cast: z.array(CastMember).nullish(),
  crew: z.array(CrewMember).nullish(),
  tmdbUrl: z.string(),
});
export type Metadata = z.infer<typeof Metadata>;
