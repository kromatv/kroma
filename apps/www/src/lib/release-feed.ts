import { z } from 'zod';

// Every URL here is rendered into a prerendered page, so `https` is required at
// the boundary rather than checked at the call site.
const Https = z.url({ protocol: /^https$/ });

const Asset = z.object({
  name: z.string().min(1),
  size: z.number().int().positive(),
  browser_download_url: Https,
  // Nullish because an asset uploaded before GitHub shipped the field carries none.
  digest: z.string().nullish(),
  // When the file was uploaded, which for a rolling tag is the only honest build
  // date: the release's own `published_at` is when the tag was first cut.
  created_at: z.string().nullish(),
});
export type Asset = z.infer<typeof Asset>;

export const Release = z.object({
  tag_name: z.string().min(1),
  body: z.string().nullish(),
  draft: z.boolean().default(false),
  prerelease: z.boolean().default(false),
  published_at: z.string().nullish(),
  html_url: Https,
  assets: z.array(Asset).default([]),
});
export type Release = z.infer<typeof Release>;

/** The releases endpoint answers with an array; a bad entry drops rather than
 *  failing the whole feed, so one malformed release cannot empty the archive. */
export const Feed = z
  .array(z.unknown())
  .transform((entries) =>
    entries.map((entry) => Release.safeParse(entry)).flatMap((r) => (r.success ? [r.data] : [])),
  );
