// The browser-specific half of push: capability check, service worker
// registration, and `PushSubscription` → `SubscribeBody`. The shared flow lives
// in `enablePush` / `disablePush` in `@kroma/core`.

import type { PushBlocker, PushCapability, PushSubscribeContext, SubscribeBody } from '@kroma/core';
import { base64UrlToBytes, bytesToBase64Url } from '#web/shared/lib/base64url';
import { deviceInfo } from '#web/shared/lib/device';

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

/** `null` means push is available here. */
export function pushBlocker(): PushBlocker | null {
  if (typeof window === 'undefined') return 'unsupported';
  // Service workers need a secure context: http://localhost qualifies, a LAN IP
  // over plain http does not.
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

export const webPush: PushCapability = {
  async blocker() {
    return pushBlocker();
  },

  async subscribe({ applicationServerKey }: PushSubscribeContext): Promise<SubscribeBody> {
    // Requested inside the user's click, never on page load: a prompt fired at
    // startup is the fastest way to get denied forever.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('denied');

    const registration = await register();
    // Re-subscribing with a different applicationServerKey throws, so drop any
    // stale subscription first.
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const subscription = await registration.pushManager.subscribe({
      // A push that isn't shown to the user gets the site's permission revoked.
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
