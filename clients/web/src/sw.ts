// KROMA service worker: the half of Web Push that runs when the app is closed.
import * as z from 'zod/mini';
import { bytesToBase64Url } from './shared/lib/base64url';

// lib.webworker types `self` as the generic WorkerGlobalScope, which has no
// clients/registration/skipWaiting. Narrowing it here is the standard idiom.
declare const self: ServiceWorkerGlobalScope;

// Take over as soon as an updated worker is installed rather than waiting for
// every tab to close: a stale worker showing the old notification format is
// worse than a momentary swap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Every field degrades on its own rather than failing the whole payload: a
// push that shows nothing breaches the "must be user-visible" rule that gets
// a site's push permission revoked. `catch` is what buys that: absent, wrong
// type and empty all land on `undefined`, and the caller's fallback takes over.
const text = z.catch(z.optional(z.string().check(z.minLength(1))), undefined);

const Action = z.object({
  id: z.catch(z.string(), ''),
  label: z.catch(z.string(), ''),
  kind: z.catch(z.optional(z.enum(['link', 'api'])), undefined),
  href: text,
  method: text,
});

const actions = z.catch(z.array(Action), []);

const Payload = z.object({
  title: text,
  body: text,
  imageUrl: text,
  link: text,
  id: text,
  actions,
});

const NotificationData = z.pick(Payload, { link: true, actions: true });

const EMPTY = Payload.parse({});

type PushAction = z.infer<typeof Action>;

// Three fields lib.dom omits because they are only specified for persistent
// (service-worker) notifications, which is exactly what these are: `image` is
// the big-picture poster, `renotify` re-alerts when a `tag` replaces an
// existing notification instead of swapping it silently, and `actions` is the
// buttons. Engines that lack them ignore them.
interface KromaNotificationOptions extends NotificationOptions {
  image?: string;
  renotify?: boolean;
  actions?: { action: string; title: string; icon?: string }[];
}

function payloadOf(event: PushEvent) {
  try {
    return Payload.safeParse(event.data?.json()).data ?? EMPTY;
  } catch {
    // Browsers may strip the body under storage pressure; still show something.
    return EMPTY;
  }
}

self.addEventListener('push', (event) => {
  const data = payloadOf(event);
  const options: KromaNotificationOptions = {
    body: data.body ?? '',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-32.png',
    image: data.imageUrl,
    // Collapse a retried delivery instead of stacking duplicates.
    tag: data.id,
    renotify: Boolean(data.id),
    data: { link: data.link, actions: data.actions },
    // Chrome shows at most two; the server orders them most-useful-first.
    actions: data.actions.slice(0, 2).map((a) => ({ action: a.id, title: a.label })),
  };
  event.waitUntil(self.registration.showNotification(data.title ?? 'KROMA', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const clicked = NotificationData.safeParse(event.notification.data).data;
  // Guarded on `event.action`: a body click passes `''`, which would otherwise
  // match an action whose id failed validation and caught to `''`.
  const chosen = event.action ? clicked?.actions.find((a) => a.id === event.action) : undefined;
  event.waitUntil(handleClick(chosen, clicked?.link));
});

// Every url in the payload is resolved against this origin and rejected if it
// leaves it: the api call below carries the browser's credentials, and a
// notification is opened long after the push that carried it was trusted.
function sameOriginUrl(path: string): string | null {
  try {
    const url = new URL(path, self.location.origin);
    return url.origin === self.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

async function handleClick(action: PushAction | undefined, link: string | undefined) {
  const href = action?.kind === 'api' ? action.href : undefined;
  if (href && sameOriginUrl(href)) {
    try {
      await fetch(href, { method: action?.method ?? 'POST', credentials: 'include' });
      return;
    } catch {
      // Fall through to opening the app so the user can act by hand.
    }
  }
  await openApp((action?.kind === 'link' ? action.href : link) ?? '/');
}

async function openApp(path: string) {
  const url = sameOriginUrl(path) ?? self.location.origin;
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = open.find((client) => new URL(client.url).origin === self.location.origin);
  if (!existing) {
    await self.clients.openWindow(url);
    return;
  }
  await existing.focus();
  try {
    await existing.navigate(url);
  } catch {
    // Cross-origin or unsupported: the focus alone is still useful.
  }
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const subscription = event.newSubscription;
      // `getKey` is optional-called: an older engine may hand back a
      // subscription object that does not implement it at all.
      const p256dh = subscription?.getKey?.('p256dh');
      const auth = subscription?.getKey?.('auth');
      if (!subscription || !p256dh || !auth) return;
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transport: 'webpush',
          endpoint: subscription.endpoint,
          p256dh: bytesToBase64Url(p256dh),
          auth: bytesToBase64Url(auth),
        }),
      });
    })(),
  );
});
