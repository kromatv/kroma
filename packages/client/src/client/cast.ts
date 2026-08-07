// Cast: start a title on another device (the TV) and keep driving it.
//
// Receivers call `announceCast` on a heartbeat; senders call `castReceivers` +
// `sendCastCommand`. Everything needs a session with the `playback` capability -
// casting is watching, just on another screen.

import type { CastAnnounceBody, CastAnnounceReply, CastCommand, CastReceiver } from '../types';
import { JSON_HEADERS, type RequestContext } from './base';

/** Register + heartbeat + ack, in one call (a receiver). The reply carries any
 * command this receiver still has to apply, so a TV whose event socket dropped
 * still gets what it was told - one beat late instead of never. */
export function announceCast(
  ctx: RequestContext,
  body: CastAnnounceBody,
): Promise<CastAnnounceReply> {
  return ctx.json<CastAnnounceReply>('/cast/announce', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** Leave the roster (sign-out / app quit) instead of lingering until the TTL. */
export async function unregisterCast(ctx: RequestContext, receiverId: string): Promise<void> {
  await ctx.json<void>(`/cast/receivers/${encodeURIComponent(receiverId)}`, { method: 'DELETE' });
}

/** Every live receiver on the server, the caller's own devices first. */
export function castReceivers(ctx: RequestContext): Promise<CastReceiver[]> {
  return ctx.json<CastReceiver[]>('/cast/receivers');
}

/** Send one order to a receiver. Resolves with the command's sequence number;
 * throws `KromaApiError` 404 when the TV went away between listing and sending. */
export async function sendCastCommand(
  ctx: RequestContext,
  receiverId: string,
  command: CastCommand,
): Promise<number> {
  const { seq } = await ctx.json<{ seq: number }>(
    `/cast/receivers/${encodeURIComponent(receiverId)}/command`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(command) },
  );
  return seq;
}
