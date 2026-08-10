// Quick Connect: the code a device shows, and the poll that redeems it.

import { PairingStatus, type QuickConnectInit, validate } from '../schemas';
import { JSON_HEADERS, KromaApiError, type RequestContext } from './base';

/**
 * Start a Quick Connect request → a code to display + a secret to poll with.
 * Pass `prevSecret` when rotating an expiring code so the server revokes the old
 * one up front (stops it being approvable) instead of leaving it to lapse on TTL.
 */
export function quickConnectInitiate(
  ctx: RequestContext,
  prevSecret?: string,
): Promise<QuickConnectInit> {
  return ctx.json<QuickConnectInit>('/auth/quickconnect/initiate', {
    method: 'POST',
    ...(prevSecret ? { headers: JSON_HEADERS, body: JSON.stringify({ prevSecret }) } : {}),
  });
}

const PAIRING_SECRET_HEADER = 'x-kroma-pairing-secret';

// A server that predates the header still declares `secret` a required query
// parameter, so axum rejects the header-only poll with a 400 before the handler
// runs. Remembered per server: the poll repeats every couple of seconds, and
// re-probing the header form would spend a failed request on every tick.
const legacyPollServers = new Set<string>();

function pollWithQuery(ctx: RequestContext, secret: string): Promise<PairingStatus> {
  return ctx.json<PairingStatus>(`/auth/quickconnect/poll?secret=${encodeURIComponent(secret)}`);
}

async function pollStatus(ctx: RequestContext, secret: string): Promise<PairingStatus> {
  if (legacyPollServers.has(ctx.baseUrl)) return pollWithQuery(ctx, secret);
  try {
    return await ctx.json<PairingStatus>('/auth/quickconnect/poll', {
      headers: { [PAIRING_SECRET_HEADER]: secret },
    });
  } catch (e) {
    if (!(e instanceof KromaApiError) || e.status !== 400) throw e;
    const status = await pollWithQuery(ctx, secret);
    legacyPollServers.add(ctx.baseUrl);
    return status;
  }
}

/** Poll a Quick Connect request by its secret.
 *
 * The secret rides in a header rather than the query: a URL is written into
 * every access log the request passes through, and this one redeems a 90-day
 * credential. A server old enough to demand `?secret=` refuses that request, and
 * only such a server is re-polled the legacy way, once and then for good. */
export async function quickConnectPoll(
  ctx: RequestContext,
  secret: string,
): Promise<PairingStatus> {
  return validate(PairingStatus, await pollStatus(ctx, secret));
}

/** Approve a device's Quick Connect code (requires the approver's token). */
export async function quickConnectAuthorize(ctx: RequestContext, code: string): Promise<void> {
  await ctx.json<void>('/auth/quickconnect/authorize', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ code }),
  });
}
