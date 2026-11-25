import { z } from 'zod';

/** One person TMDB offers for a name being typed in a title's edit: their
 * portrait at the size a cast shows it, the work they are known for
 * (`Acting`, `Directing`) and up to three of their titles. */
export const TmdbPerson = z.object({
  tmdbId: z.number(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  department: z.string().nullable(),
  knownFor: z.array(z.string()),
});
export type TmdbPerson = z.infer<typeof TmdbPerson>;

/** One studio TMDB offers for a name being typed in a title's edit: its logo
 * and the country it comes from (`US`). */
export const TmdbStudio = z.object({
  tmdbId: z.number(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  country: z.string().nullable(),
});
export type TmdbStudio = z.infer<typeof TmdbStudio>;

/** `GET /api/edits/people?q=…`: at most ten, in TMDB's order, and nobody for a
 * blank name or on a server without a TMDB key. */
export const TmdbPeople = z.object({ results: z.array(TmdbPerson) });
export type TmdbPeople = z.infer<typeof TmdbPeople>;

/** `GET /api/edits/studios?q=…`, offered as {@link TmdbPeople} are. */
export const TmdbStudios = z.object({ results: z.array(TmdbStudio) });
export type TmdbStudios = z.infer<typeof TmdbStudios>;
