import { z } from 'zod';

/** `GET /api/server/direct`: the addresses this server answers at on the
 * caller's network, whether it places the caller there, and a challenge a
 * route has to answer before it is trusted. */
export const DirectOffer = z.object({
  instanceId: z.string().max(256),
  routes: z.array(z.string().max(256)).max(32),
  nonce: z.string().max(256),
  answer: z.string().max(256),
  sameNetwork: z.boolean(),
});
export type DirectOffer = z.infer<typeof DirectOffer>;

/** `GET /api/server/direct/proof?nonce=`, asked down a candidate route. */
export const DirectProof = z.object({
  answer: z.string().max(256),
});
export type DirectProof = z.infer<typeof DirectProof>;
