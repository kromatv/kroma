// This browser's push capability.
//
// Only the parts that are genuinely a browser's: whether push can work here,
// registering the service worker, and turning a `PushSubscription` into what
// the server stores. The order of operations (check before prompting), the
// blocker vocabulary and the server calls are shared with every other client —
// see `enablePush` / `disablePush` in `@kroma/core`.

import type { PushBlocker, PushCapability, PushSubscribeContext, SubscribeBody } from '@kroma/core';
import { deviceInfo } from '#web/shared/lib/device';

/** Register the worker (idempotent) and return its registration. */
async function register(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag for home-screen installs.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** Why push isn't available in this browser, or `null` when it is. */
export function pushBlocker(): PushBlocker | null {
  if (typeof window === 'undefined') return 'unsupported';
  // Service workers need a secure context. localhost counts as secure, so dev
  // over http://localhost works; a LAN IP over plain http does not.
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // iOS exposes PushManager only to home-screen installs, so distinguish
    // "your browser can't" from "install it first and it can".
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    return 'denied';
  }
  return null;
}

/** The browser half of the shared push flow. */
export const webPush: PushCapability = {
  async blocker() {
    return pushBlocker();
  },

  async subscribe({ applicationServerKey }: PushSubscribeContext): Promise<SubscribeBody> {
    // Permission is requested here — inside the user's click — not on page load.
    // A prompt fired at startup is the fastest way to get denied forever.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('denied');

    const registration = await register();
    // Re-subscribing with a different applicationServerKey throws, so drop a
    // stale subscription first (the server's key only changes if an operator
    // wiped it, and then every existing subscription is dead anyway).
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const subscription = await registration.pushManager.subscribe({
      // Required: a push that isn't shown to the user gets the site's
      // permission revoked, and we always show one.
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(applicationServerKey),
    });

    return {
      transport: 'webpush',
      endpoint: subscription.endpoint,
      p256dh: keyOf(subscription, 'p256dh'),
      auth: keyOf(subscription, 'auth'),
      device: deviceInfo(navigator.userAgent, 'Browser').label,
    };
  },

  async endpoint() {
    if (pushBlocker()) return null;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  },

  async unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  },
};

function keyOf(subscription: PushSubscription, name: 'p256dh' | 'auth'): string {
  const raw = subscription.getKey(name);
  if (!raw) throw new Error('unsupported');
  return bytesToBase64Url(new Uint8Array(raw));
}

/** `applicationServerKey` must be raw bytes, not the base64url string. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  // Allocate the backing ArrayBuffer explicitly: `applicationServerKey` takes a
  // BufferSource over a plain ArrayBuffer, and a bare `new Uint8Array(n)` is
  // typed over the possibly-shared `ArrayBufferLike`.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCodePoint(b);
  const b64 = btoa(binary).replaceAll('+', '-').replaceAll('/', '_');
  // Strip the padding in one linear pass. A `/=+$/` regex is super-linear here:
  // unanchored at the start, it retries and backtracks the run at every
  // position (the same reasoning as stripTrailingSlash in the Synology
  // generator, and sw.js's copy of this function).
  let end = b64.length;
  while (end > 0 && b64[end - 1] === '=') end--;
  return b64.slice(0, end);
}
