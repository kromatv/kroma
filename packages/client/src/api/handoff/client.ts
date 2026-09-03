import type { RequestContext } from '../../core/client';
import { PairingStatus } from '../accounts';
import type { HandoffHandle } from './ids';
import {
  type HandoffAnnounce,
  HandoffBeacon,
  HandoffDevice,
  type HandoffEvidence,
} from './schemas';

export default function handoffApi(ctx: RequestContext) {
  return {
    /** Publish this device's beacon: the handle a phone grants against, the
     * secret to poll with, and how often to poll. Public, since the announcing
     * device has no account yet. */
    announce: (body: HandoffAnnounce) =>
      ctx.post('/handoff/announce', HandoffBeacon, { auth: 'public', body }),

    /** Take this beacon down early (signed in another way, or quitting) instead
     * of lingering until the TTL. */
    leave: (secret: string) => ctx.post('/handoff/leave', { auth: 'public', body: { secret } }),

    /** Poll this beacon by its secret: `pending` until a phone grants it, then
     * the session exactly once. Polling also keeps the beacon listed, so a TV
     * that stops polling drops off every phone's list on its own.
     *
     * A POST with the secret in the body, not a GET with it in the query: this
     * is not a read (it refreshes the beacon and consumes the grant), and a URL
     * is written into every access log the request passes through. */
    poll: (secret: string) =>
      ctx.post('/handoff/poll', PairingStatus, { auth: 'public', body: { secret } }),

    /** The TVs waiting on this device's own network. Empty off it: the same
     * answer as "none waiting", which is all a caller may learn. (Bearer.) */
    devices: () => ctx.get('/handoff/devices', HandoffDevice.array()),

    /** Hand this account to the TV behind `handle`. Throws `KromaApiError` 400
     * when a check was required and none was sent, 403 when the check was wrong
     * and more attempts remain, 429 when they have run out, and 404 when that TV
     * stopped waiting. (Bearer.) */
    grant: (handle: HandoffHandle, evidence: HandoffEvidence = {}) =>
      ctx.post('/handoff/grant', { body: { handle, ...evidence } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    handoff: ReturnType<typeof handoffApi>;
  }
}
