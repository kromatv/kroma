import type { RequestContext } from '../../core/client';
import { DirectOffer } from './schemas';

/** The server's own reach: how a client on its network can talk to it directly. */
export default function serverApi(ctx: RequestContext) {
  return {
    /** Always asked on the base the client was configured with: the answer is
     * what decides whether another base is worth trying. */
    direct: (opts?: { signal?: AbortSignal }) =>
      ctx.get('/server/direct', DirectOffer, { canonical: true, signal: opts?.signal }),
  };
}

declare module '../../core/client' {
  interface Domains {
    server: ReturnType<typeof serverApi>;
  }
}
