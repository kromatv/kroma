import { z } from 'zod';

/** The newest build a channel offers. `build` is the CI build number, set on
 * the canary channel only. */
export const UpdateRelease = z.object({
  version: z.string(),
  build: z.number().nullish(),
  url: z.string(),
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
