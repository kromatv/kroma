// Nearby handoff: a TV with no account announces itself, a phone already signed
// in lists the TVs on its own network and hands one its account.
//
// The TV side (`announceHandoff` / `handoffPoll` / `handoffLeave`) needs no
// session, which is the whole point. The phone side
// (`handoffDevices` / `handoffGrant`) needs one: what it grants is its own
// account. Both sides are refused off the local network, server-side.

import { HandoffBeacon, HandoffDevice, PairingStatus, validate } from '../schemas';
import { JSON_HEADERS, type RequestContext } from './base';

/** What a TV says about itself when it starts waiting. `deviceId` is its stable
 * per-install id (8-64 of `[A-Za-z0-9._-]`, same shape as a cast receiver id);
 * re-announcing under it replaces the TV's own row instead of adding a second.
 * `prevSecret` retires the beacon being replaced up front. */
export interface HandoffAnnounce {
  deviceId: string;
  name: string;
  platform: string;
  prevSecret?: string;
}

/** Publish this device's beacon → the handle a phone grants against, the secret
 * to poll with, and how often to poll. Public: the announcing device has no
 * account yet. */
export function announceHandoff(
  ctx: RequestContext,
  body: HandoffAnnounce,
): Promise<HandoffBeacon> {
  return ctx
    .json<HandoffBeacon>('/handoff/announce', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
    .then((r) => HandoffBeacon.parse(r));
}

/** Take this beacon down early (signed in another way, or quitting) instead of
 * lingering until the TTL. */
export async function handoffLeave(ctx: RequestContext, secret: string): Promise<void> {
  await ctx.json<void>('/handoff/leave', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ secret }),
  });
}

/** Poll this beacon by its secret → `pending` until a phone grants it, then the
 * session exactly once. Polling also keeps the beacon listed, so a TV that stops
 * polling drops off every phone's list on its own.
 *
 * A POST with the secret in the body, not a GET with it in the query: this is
 * not a read (it refreshes the beacon and consumes the grant), and a URL is
 * written into every access log the request passes through. */
export function handoffPoll(ctx: RequestContext, secret: string): Promise<PairingStatus> {
  return ctx
    .json<PairingStatus>('/handoff/poll', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ secret }),
    })
    .then((r) => validate(PairingStatus, r));
}

/** The TVs waiting on this device's own network. Empty off it:
 * the same answer as "none waiting", which is all a caller may learn. (Bearer.)
 *
 * Answers with the PARSED rows rather than the body as it arrived, so
 * `confirmRequired` is a boolean on every one of them and an older server's
 * silence about it reads as the safe answer instead of as `undefined`. */
export function handoffDevices(ctx: RequestContext): Promise<HandoffDevice[]> {
  return ctx.json<HandoffDevice[]>('/handoff/devices').then((r) => HandoffDevice.array().parse(r));
}

/** What a phone sends alongside the handle: why it should be believed to be
 * beside that television. */
export interface HandoffEvidence {
  /** This device heard that TV's record on its own link rather than being told
   * about it by the server. The stronger of the two, and the only one that
   * holds when the addresses cannot be reconciled. */
  proof?: string;
  /** The check string the TV is printing, read off its screen by the person
   * granting. Demanded of a beacon the server could not place by its origin -
   * a screen is the one thing a page pretending to be a television has not
   * got. Case and surrounding space are the server's to normalise. */
  check?: string;
}

/** Hand this account to the TV behind `handle`. Resolves on 204; throws
 * `KromaApiError` 400 when a check was required and none was sent, 403 when the
 * check was wrong and more attempts remain, 429 when they have run out, and 404
 * when that TV stopped waiting. (Bearer.) */
export async function handoffGrant(
  ctx: RequestContext,
  handle: string,
  evidence: HandoffEvidence = {},
): Promise<void> {
  await ctx.json<void>('/handoff/grant', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      handle,
      proof: evidence.proof || undefined,
      check: evidence.check || undefined,
    }),
  });
}
