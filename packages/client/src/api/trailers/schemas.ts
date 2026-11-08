import { z } from 'zod';

/** How a trailer reaches its viewer: spoken in their language, with subtitles
 * in it burned into the picture, or in neither. */
export const TrailerVersion = z.enum(['localized', 'subtitled', 'original']);
export type TrailerVersion = z.infer<typeof TrailerVersion>;

export const TrailerKind = z.enum(['trailer', 'teaser']);
export type TrailerKind = z.infer<typeof TrailerKind>;

/** One trailer of a title. `video` is the YouTube id the server fetches it by;
 * `language` is the ISO 639-1 code TMDB files it under. */
export const Trailer = z.object({
  video: z.string(),
  name: z.string(),
  language: z.string(),
  version: TrailerVersion,
  kind: TrailerKind,
  official: z.boolean(),
  publishedAt: z.string().nullish(),
});
export type Trailer = z.infer<typeof Trailer>;

/** A title's trailers, best first for the viewer who asked, and whether this
 * server can play them: it can when a module answers the `trailer` point. */
export const TrailerList = z.object({
  playable: z.boolean(),
  trailers: z.array(Trailer),
});
export type TrailerList = z.infer<typeof TrailerList>;

/** Where a trailer stands: `preparing` while the server fetches it, `ready`
 * once its stream plays, `failed` when the source refused it. */
export const TrailerPreparation = z.object({
  status: z.enum(['ready', 'preparing', 'failed']),
});
export type TrailerPreparation = z.infer<typeof TrailerPreparation>;
