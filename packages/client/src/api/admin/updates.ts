import { z } from 'zod';

/** The newest build a channel offers, with the CI build number its server
 * package carries. `url` is always an https page. */
export const UpdateRelease = z.object({
  version: z.string(),
  build: z.number().nullish(),
  url: z.string().refine((url) => url.startsWith('https://')),
  publishedAt: z.string().nullish(),
});
export type UpdateRelease = z.infer<typeof UpdateRelease>;

/** `GET /api/admin/updates`: the running build, the last answer of the
 * owner's channel, and whether it is newer. */
export const UpdateStatus = z.object({
  version: z.string(),
  build: z.number(),
  channel: z.enum(['Stable', 'Canary']),
  auto: z.boolean(),
  latest: UpdateRelease.nullish(),
  available: z.boolean(),
  checkedAt: z.string().nullish(),
  error: z.string().nullish(),
});
export type UpdateStatus = z.infer<typeof UpdateStatus>;
