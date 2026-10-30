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

export const UpdateTarget = z.object({
  channel: z.enum(['Stable', 'Canary']),
  version: z.string(),
  build: z.number().int().positive(),
});
export type UpdateTarget = z.infer<typeof UpdateTarget>;

export const UpdateOperation = z.object({
  id: z.string(),
  target: UpdateTarget,
  phase: z.enum([
    'backing_up',
    'queued',
    'preparing',
    'waiting_idle',
    'deferred',
    'installing',
    'restarting',
    'complete',
    'failed',
  ]),
  message: z.string().nullish(),
  requestedAt: z.string(),
  automatic: z.boolean().optional(),
});
export type UpdateOperation = z.infer<typeof UpdateOperation>;

/** `GET /api/admin/updates`: the running build, the last answer of the
 * owner's channel, and whether it is newer. */
export const UpdateStatus = z.object({
  version: z.string(),
  build: z.number(),
  channel: z.enum(['Stable', 'Canary']),
  auto: z.boolean(),
  autoInstall: z.boolean().default(false),
  latest: UpdateRelease.nullish(),
  available: z.boolean(),
  checkedAt: z.string().nullish(),
  error: z.string().nullish(),
  // Optional for clients connected to servers released before the host bridge.
  installer: z
    .object({ platform: z.enum(['docker', 'synology', 'binary', 'unknown']), ready: z.boolean() })
    .optional(),
  operation: UpdateOperation.nullish(),
});
export type UpdateStatus = z.infer<typeof UpdateStatus>;
