// Turning push on and off, once, for every client.
//
// The three transports differ only in HOW a device is reached — a browser's
// PushManager, APNs, FCM. Everything around that is identical on every client:
// check whether push is possible at all, prompt, hand the endpoint to the
// server, and reverse it on the way out. That order matters (prompting before
// checking wastes iOS's one-shot permission dialog) and it was previously
// written out per platform, which is how the web and the phone ended up with
// two different `PushBlocker` vocabularies for the same situations.
//
// So the policy lives here and each platform supplies a {@link PushCapability}:
// roughly thirty lines of "ask this browser / this phone", no orchestration.

import type { KromaClient } from './api';
import type { SubscribeBody } from './schemas/notifications';

/**
 * Why push cannot work on this device, or `null` when it can.
 *
 * One vocabulary across every client, because the settings screens all have to
 * answer the same question — "why is this toggle not doing anything?" — and a
 * user moving between the web app and the phone should not meet two different
 * explanations of the same wall.
 */
export type PushBlocker =
  /** No push support here at all (an old browser, an unsupported platform). */
  | 'unsupported'
  /** Web: service workers need HTTPS. A LAN IP over plain http will not do. */
  | 'insecure'
  /** Web on iOS: only an installed (home-screen) app may receive push. */
  | 'needs-install'
  /** Native: the JS is newer than the binary; the app needs a native rebuild. */
  | 'needs-rebuild'
  /** Native: a simulator that cannot mint a real device token. */
  | 'simulator'
  /** The user said no. Terminal from inside the app on iOS. */
  | 'denied';

/** What {@link PushCapability.subscribe} is given by the shared layer. */
export interface PushSubscribeContext {
  /**
   * The server's VAPID public key. Web needs it as `applicationServerKey`;
   * the native transports ignore it. Fetched once here so no platform adapter
   * has to know about `/api/push/key`.
   */
  applicationServerKey: string;
}

/**
 * The per-platform half: reaching this device's push system.
 *
 * Implementations do no orchestration and talk to no API — they answer
 * questions about the device and hand back a subscription. Throwing a
 * {@link PushBlocker} as the error message from `subscribe` is how a platform
 * reports a refusal it could only discover by trying.
 */
export interface PushCapability {
  /** Why push cannot work here, or `null`. Checked before any prompt. */
  blocker(): Promise<PushBlocker | null>;
  /** Prompt if needed, subscribe, and describe the result for the server. */
  subscribe(context: PushSubscribeContext): Promise<SubscribeBody>;
  /** The endpoint currently registered on this device, if any. */
  endpoint(): Promise<string | null>;
  /** Undo the platform-side subscription (the server side is handled here). */
  unsubscribe(): Promise<void>;
}

/**
 * Turn push on for this device.
 *
 * Throws with a {@link PushBlocker} as the message, so a caller can look the
 * reason straight up in its own translations.
 */
export async function enablePush(capability: PushCapability, client: KromaClient): Promise<void> {
  const blocker = await capability.blocker();
  if (blocker) throw new Error(blocker);

  // Minting the server's VAPID key on first use, before the prompt: if this
  // fails there is no point asking the user for anything.
  const { publicKey } = await client.pushKey();
  const subscription = await capability.subscribe({ applicationServerKey: publicKey });
  await client.subscribePush(subscription);
}

/**
 * Turn push off for this device, both sides.
 *
 * The platform subscription goes first: if the server call then fails, the
 * device is already silent and the stale row is pruned on its next failed
 * delivery. The other order would leave a device the user believes is off but
 * which still buzzes.
 */
export async function disablePush(capability: PushCapability, client: KromaClient): Promise<void> {
  const endpoint = await capability.endpoint();
  await capability.unsubscribe();
  if (endpoint) await client.unsubscribePush(endpoint);
}
