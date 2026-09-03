import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import type { SubscribeBody } from './schemas';

const PushKey = z.object({ publicKey: z.string(), subscribed: z.boolean() });
const Delivered = z.object({ delivered: z.number() });

/** Web Push and the native transports, from this device's side. */
export function pushApi(ctx: RequestContext) {
  return {
    /** The server's VAPID public key (`applicationServerKey`); the keypair is
     * minted on the first call. */
    key: () => ctx.get('/push/key', PushKey),

    /** Re-registering the same endpoint updates it rather than duplicating, and
     * moves it to the calling account. */
    subscribe: (body: SubscribeBody) => ctx.post('/push/subscribe', { body }),

    unsubscribe: (endpoint: string) => ctx.delete('/push/subscribe', { body: { endpoint } }),

    test: () => ctx.post('/push/test', Delivered),
  };
}
