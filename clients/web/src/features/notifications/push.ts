// Browser-side Web Push: register the service worker, subscribe with the
// server's VAPID key, and hand the endpoint back.
//
// Everything here is capability-checked rather than assumed. Push is absent in
// plenty of ordinary situations — Safari before 16.4, any iOS browser that isn't
// installed to the home screen, a page served over plain HTTP, a private window —
// and the settings UI needs to explain which of those applies instead of showing
// a toggle that silently does nothing.

import { kromaClient } from '#web/shared/lib/api';

/** Why push isn't available here, or `null` when it is. */
export type PushBlocker = 'unsupported' | 'insecure' | 'needs-install' | 'denied';

export interface PushState {
  blocker: PushBlocker | null;
  subscribed: boolean;
}

/** Whether this browser can do Web Push at all, and if not, why. */
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

/** Register the worker (idempotent) and return its registration. */
async function register(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Whether this browser currently holds a push subscription. */
export async function currentEndpoint(): Promise<string | null> {
  if (pushBlocker()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

/**
 * Turn push on: ask permission, subscribe with the server's key, register the
 * endpoint. Throws with a translatable reason on refusal.
 */
export async function enablePush(): Promise<void> {
  const blocker = pushBlocker();
  if (blocker) throw new Error(blocker);

  // Permission is requested here — inside a click handler — not on page load.
  // A prompt fired at startup is the single fastest way to get denied forever.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const registration = await register();
  const { publicKey } = await kromaClient().pushKey();

  // Re-subscribing with a different applicationServerKey throws, so drop a
  // stale subscription first (the server's key can only change if an operator
  // wiped it, but then every existing subscription is dead anyway).
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const subscription = await registration.pushManager.subscribe({
    // Required: a push that isn't shown to the user gets the site's permission
    // revoked, and we always show one.
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });

  await kromaClient().subscribePush({
    transport: 'webpush',
    endpoint: subscription.endpoint,
    p256dh: keyOf(subscription, 'p256dh'),
    auth: keyOf(subscription, 'auth'),
    device: deviceLabel(),
  });
}

/** Turn push off on this device, both locally and on the server. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await kromaClient().unsubscribePush(endpoint);
}

function keyOf(subscription: PushSubscription, name: 'p256dh' | 'auth'): string {
  const raw = subscription.getKey(name);
  if (!raw) throw new Error('unsupported');
  return bytesToBase64Url(new Uint8Array(raw));
}

/** First matching label for `ua` from `[pattern, label]` pairs, or `fallback`.
 *  ORDER MATTERS and is why this is a list rather than a map: Edge and Chrome
 *  both claim "Chrome" in their user agent, and every Chromium browser also
 *  claims "Safari", so the more specific pattern has to be tested first. */
function firstMatch(ua: string, table: [RegExp, string][], fallback: string): string {
  for (const [pattern, label] of table) if (pattern.test(ua)) return label;
  return fallback;
}

const BROWSERS: [RegExp, string][] = [
  [/Firefox\//, 'Firefox'],
  [/Edg\//, 'Edge'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const PLATFORMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** A human label for the "your devices" list. Best effort, never precise. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = firstMatch(ua, BROWSERS, 'Browser');
  const os = firstMatch(ua, PLATFORMS, '');
  return os ? `${browser} on ${os}` : browser;
}

/** `applicationServerKey` must be raw bytes, not the base64url string. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  // Allocate the backing ArrayBuffer explicitly: `applicationServerKey` takes a
  // BufferSource over a plain ArrayBuffer, and a bare `new Uint8Array(n)` is
  // typed over the possibly-shared `ArrayBufferLike`.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
