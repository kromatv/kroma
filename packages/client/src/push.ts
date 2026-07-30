// Turning push on and off, once, for every client. The three transports
// (PushManager, APNs, FCM) differ only in how a device is reached; the shared
// check/prompt/register/unregister policy lives here, and each platform
// supplies a {@link PushCapability} that only answers questions about the device.

import type { KromaClient } from './api';
import type { SubscribeBody } from './schemas/notifications';

/** Why push cannot work on this device, or `null` when it can. One vocabulary
 * across every client, so the settings screen gives the same explanation on
 * the web app and the phone. */
export type PushBlocker =
  | 'unsupported'
  | 'insecure'
  | 'needs-install'
  | 'needs-rebuild'
  | 'simulator'
  | 'denied';

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

  // Minting the server's VAPID key on first use, before the prompt: if this
  // fails there is no point asking the user for anything.
  const { publicKey } = await client.pushKey();
  const subscription = await capability.subscribe({ applicationServerKey: publicKey });
  await client.subscribePush(subscription);
}

/** Turn push off for this device, both sides. The platform subscription goes
 * first: if the server call then fails, the device is already silent instead
 * of one the user believes is off but which still buzzes. */
export async function disablePush(capability: PushCapability, client: KromaClient): Promise<void> {
  const endpoint = await capability.endpoint();
  await capability.unsubscribe();
  if (endpoint) await client.unsubscribePush(endpoint);
}
