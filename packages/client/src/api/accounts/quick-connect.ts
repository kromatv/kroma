import { KromaApiError, type RequestContext } from '../../core/http';
import { PairingStatus, QuickConnectInit } from './schemas';

const PAIRING_SECRET_HEADER = 'x-kroma-pairing-secret';

function poller(ctx: RequestContext) {
  let legacy = false;
  return async (secret: string): Promise<PairingStatus> => {
    const withQuery = () =>
      ctx.get('/auth/quickconnect/poll', PairingStatus, { auth: 'public', query: { secret } });
    if (legacy) return withQuery();
    try {
      return await ctx.get('/auth/quickconnect/poll', PairingStatus, {
        auth: 'public',
        headers: { [PAIRING_SECRET_HEADER]: secret },
      });
    } catch (e) {
      if (!(e instanceof KromaApiError) || e.status !== 400) throw e;
      const status = await withQuery();
      legacy = true;
      return status;
    }
  };
}

/** Quick Connect: the code a device shows, and the poll that redeems it. */
export function quickConnectApi(ctx: RequestContext) {
  const poll = poller(ctx);
  return {
    /** Start a request: a code to display plus a secret to poll with. Pass
     * `prevSecret` when rotating an expiring code so the server revokes the old
     * one up front instead of leaving it to lapse on TTL. */
    initiate: (prevSecret?: string) =>
      ctx.post('/auth/quickconnect/initiate', QuickConnectInit, {
        auth: 'public',
        body: { prevSecret },
      }),

    /** Poll a request by its secret.
     *
     * The secret rides in a header rather than the query: a URL is written into
     * every access log the request passes through, and this one redeems a 90-day
     * credential. A server old enough to demand `?secret=` refuses that request,
     * and only such a server is re-polled the legacy way, once and then for good. */
    poll,

    /** Approve a device's code (requires the approver's token). */
    authorize: (code: string) => ctx.post('/auth/quickconnect/authorize', { body: { code } }),
  };
}
