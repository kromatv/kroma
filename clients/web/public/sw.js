// KROMA service worker: the half of Web Push that runs when the app is closed.
//
// Deliberately tiny and hand-written. It does NOT cache or intercept fetches —
// this is not an offline app, the media comes off a server on your LAN — so
// there is no cache to go stale and no build step to keep in sync. All it does
// is show pushes and route taps.
//
// The push payload is the same JSON shape as an in-app notification row (see
// `services/notify/push.rs::payload_of`), so a push and the row it mirrors can
// never disagree about what happened.

// Take over as soon as an updated worker is installed, rather than waiting for
// every tab to close: a stale worker showing the old notification format is
// worse than a momentary swap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // A push with no payload still deserves a notification: browsers may strip the
  // body under storage pressure, and showing nothing would breach the
  // "must be user-visible" rule that gets a site's push permission revoked.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'KROMA';
  const options = {
    body: data.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-32.png',
    // The poster, when there is one — a film's artwork is the point.
    image: data.imageUrl || undefined,
    // Collapse repeats of the same notification (a retried delivery) instead of
    // stacking duplicates.
    tag: data.id || undefined,
    renotify: Boolean(data.id),
    data: {
      link: data.link || '/',
      actions: Array.isArray(data.actions) ? data.actions : [],
    },
    // Chrome shows at most two; the server orders them most-useful-first.
    actions: (Array.isArray(data.actions) ? data.actions : []).slice(0, 2).map((a) => ({
      action: a.id,
      title: a.label,
    })),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { link, actions } = event.notification.data || {};
  const chosen = event.action ? (actions || []).find((a) => a.id === event.action) : null;

  event.waitUntil(handleClick(chosen, link));
});

/**
 * A tap on the body opens `link`. A tap on an action button either navigates
 * (`kind: 'link'`) or calls the server directly (`kind: 'api'`) — the latter is
 * what lets a moderator approve a request from the lock screen without the app
 * ever coming to the foreground.
 */
async function handleClick(action, link) {
  if (action?.kind === 'api') {
    try {
      // Same-origin: the session cookie/bearer is not available here, but the
      // API is on this origin and the request carries the browser's credentials.
      await fetch(action.href, { method: action.method || 'POST', credentials: 'include' });
      return;
    } catch {
      // Fall through to opening the app so the user can act by hand.
    }
  }
  const target = action?.kind === 'link' ? action.href : link || '/';
  await openApp(target);
}

/** Focus an existing KROMA tab and navigate it, or open a new one. */
async function openApp(path) {
  const url = new URL(path, self.location.origin).href;
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    // Reuse a tab that is already on this origin rather than piling up windows.
    if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
      await client.focus();
      if ('navigate' in client) {
        try {
          await client.navigate(url);
        } catch {
          /* cross-origin or unsupported: the focus alone is still useful */
        }
      }
      return;
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url);
}

// The browser can rotate a subscription without asking. Re-register with the
// server, or that device silently stops receiving anything.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const subscription = event.newSubscription;
      if (!subscription) return;
      const key = subscription.getKey ? subscription.getKey.bind(subscription) : null;
      if (!key) return;
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transport: 'webpush',
          endpoint: subscription.endpoint,
          p256dh: base64Url(key('p256dh')),
          auth: base64Url(key('auth')),
        }),
      });
    })(),
  );
});

function base64Url(buffer) {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCodePoint(b);
  const b64 = btoa(binary).replaceAll('+', '-').replaceAll('/', '_');
  // Strip the padding in one linear pass. A `/=+$/` regex is super-linear here:
  // unanchored at the start, it retries and backtracks the run at every
  // position (same reasoning as stripTrailingSlash in the Synology generator).
  let end = b64.length;
  while (end > 0 && b64[end - 1] === '=') end--;
  return b64.slice(0, end);
}
