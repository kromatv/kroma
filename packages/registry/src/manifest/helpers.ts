import { z } from 'zod';

/** Upstream programs the host fetches and starts for a module, one pinned build
 *  per platform. */
export const Helpers = z.record(
  z.string(),
  z.strictObject({
    assets: z.record(
      z.string().regex(/^[a-z]+-[a-z0-9_]+$/),
      z.strictObject({
        url: z.url(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        member: z.string().nullish(),
      }),
    ),
  }),
);
