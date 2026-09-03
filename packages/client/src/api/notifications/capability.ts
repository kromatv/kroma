import { z } from 'zod';
import type { KromaClient } from '../../kroma-client';
import type { SubscribeBody } from './schemas';

/** Why push cannot work on this device, or `null` when it can. One vocabulary
 * across every client, so the settings screen gives the same explanation on the
 * web app and the phone. */
export const PushBlocker = z.enum([
  'unsupported',
  'insecure',
  'needs-install',
  'needs-rebuild',
  'simulator',
  'denied',
]);
export type PushBlocker = z.infer<typeof PushBlocker>;

/** What {@link PushCapability.subscribe} is given by the shared layer. */
export interface PushSubscribeContext {
  applicationServerKey: string;
}

/** The per-platform half: reaching this device's push system. Implementations
 * do no orchestration and talk to no API; throwing a {@link PushBlocker} as the
 * error message from `subscribe` is how a platform reports a refusal it could
 * only discover by trying. */
export interface PushCapability {
  blocker(): Promise<PushBlocker | null>;
  subscribe(context: PushSubscribeContext): Promise<SubscribeBody>;
  endpoint(): Promise<string | null>;
  unsubscribe(): Promise<void>;
}

/** Turn push on for this device. Throws with a {@link PushBlocker} as the
 * message, so a caller can look the reason up in its own translations. */
export async function enablePush(capability: PushCapability, client: KromaClient): Promise<void> {
  // Check before prompting: iOS grants one permission dialog per install, so
  // prompting on a device that cannot receive push burns it for good.
  const blocker = await capability.blocker();
  if (blocker) throw new Error(blocker);

  const { publicKey } = await client.notifications.push.key();
  const subscription = await capability.subscribe({ applicationServerKey: publicKey });
  await client.notifications.push.subscribe(subscription);
}

/** Turn push off for this device, both sides. The platform subscription goes
 * first: if the server call then fails, the device is already silent instead of
 * one the user believes is off but which still buzzes. */
export async function disablePush(capability: PushCapability, client: KromaClient): Promise<void> {
  const endpoint = await capability.endpoint();
  await capability.unsubscribe();
  if (endpoint) await client.notifications.push.unsubscribe(endpoint);
}
