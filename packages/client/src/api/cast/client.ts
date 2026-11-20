import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import type { DeviceId } from '../../core/ids';
import {
  type CastAnnounceBody,
  CastAnnounceReply,
  type CastCommand,
  CastReceiver,
  CastWakeReply,
} from './schemas';

const CommandAccepted = z.object({ seq: z.number() });

/** Cast: start a title on another device (the TV) and keep driving it.
 *
 * Receivers call `announce` on a heartbeat; senders call `receivers` and
 * `command`. Everything needs a session with the `playback` capability -
 * casting is watching, just on another screen. */
export default function castApi(ctx: RequestContext) {
  return {
    /** Register + heartbeat + ack, in one call (a receiver). The reply carries
     * any command this receiver still has to apply, so a TV whose event socket
     * dropped still gets what it was told, one beat late instead of never. */
    announce: (body: CastAnnounceBody) => ctx.post('/cast/announce', CastAnnounceReply, { body }),

    /** Leave the roster (sign-out / app quit) instead of lingering to the TTL. */
    unregister: (receiverId: DeviceId) =>
      ctx.delete('/cast/receivers/:receiverId', { params: { receiverId } }),

    /** Every live receiver on the account, then the ones that are off and can
     * be brought back, marked `asleep`. */
    receivers: () => ctx.get('/cast/receivers', CastReceiver.array()),

    /** Ask how to bring back a receiver that is `asleep`, and have `play` start
     * on it once it arrives. The reply carries the steps, which the caller runs
     * from where it is: the server reaches no television. The receiver turning
     * up in the roster is the only success there is. */
    wake: (receiverId: DeviceId, play?: Extract<CastCommand, { type: 'play' }>) =>
      ctx.post('/cast/receivers/:receiverId/wake', CastWakeReply, {
        params: { receiverId },
        body: { play },
      }),

    /** Stop listing a receiver that is off. */
    forgetWake: (receiverId: DeviceId) =>
      ctx.delete('/cast/receivers/:receiverId/wake', { params: { receiverId } }),

    /** Send one order to a receiver, resolving with its sequence number. Throws
     * `KromaApiError` 404 when the TV went away between listing and sending. */
    command: async (receiverId: DeviceId, command: CastCommand): Promise<number> => {
      const { seq } = await ctx.post('/cast/receivers/:receiverId/command', CommandAccepted, {
        params: { receiverId },
        body: command,
      });
      return seq;
    },
  };
}

declare module '../../core/client' {
  interface Domains {
    cast: ReturnType<typeof castApi>;
  }
}
