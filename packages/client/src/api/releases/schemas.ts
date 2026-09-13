import { z } from 'zod';

export const HighlightImage = z.object({
  url: z.string(),
  alt: z.string(),
});
export type HighlightImage = z.infer<typeof HighlightImage>;

/** One change worth a card: a title, one paragraph, at most one picture. */
export const Highlight = z.object({
  title: z.string(),
  body: z.string(),
  image: HighlightImage.optional(),
});
export type Highlight = z.infer<typeof Highlight>;

/** One release's notes in the reader's language. `action` and `owner` come back
 * empty for anyone but the server's owner. */
export const Release = z.object({
  version: z.string(),
  date: z.string().optional(),
  action: z.array(z.string()),
  highlights: z.array(Highlight),
  fixed: z.array(z.string()),
  owner: z.array(z.string()),
});
export type Release = z.infer<typeof Release>;

/** `GET /api/releases`: every release the server has reached, newest first.
 * `unseen` names the newest release with highlights the reader has not been
 * shown yet. The web marks it with a badge until the history is visited. */
export const ReleasesView = z.object({
  current: z.string(),
  unseen: z.string().nullable(),
  releases: z.array(Release),
});
export type ReleasesView = z.infer<typeof ReleasesView>;
