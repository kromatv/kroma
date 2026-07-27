// Decoding the tile selection that launched or re-targeted the app.

import { tizen } from '#tv/shared/preview/tizen';
import type { DeepLink } from '#tv/shared/preview/types';

function asDeepLink(obj: unknown): DeepLink | null {
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if ((o.type === 'movie' || o.type === 'show') && typeof o.id === 'string') {
      return { type: o.type, id: o.id };
    }
  }
  return null;
}

/** Decode a tile's PAYLOAD. The platform delivers our `action_data` either
 *  verbatim, or wrapped as `{"values": "<uri-encoded JSON>"}` (the envelope
 *  Samsung's own sample unwraps) handle both. */
function parsePayload(raw: string): DeepLink | null {
  try {
    const first = JSON.parse(raw) as unknown;
    const direct = asDeepLink(first);
    if (direct) return direct;
    const values = (first as { values?: unknown })?.values;
    if (typeof values === 'string') {
      return asDeepLink(JSON.parse(decodeURIComponent(values)));
    }
  } catch {
    /* ignore malformed payloads */
  }
  return null;
}

// A deep link handed in by a SHELL rather than read off a platform global.
//
// The native TV app is the case: its launcher rows arrive through React
// Native's `Linking`, which no code in this package can subscribe to. So the
// shell parses the URL and pushes the result here, exactly the way
// `app/searchRequest` takes a search from Siri.
//
// A link that arrives before anyone is listening is KEPT (a launcher tile cold-
// starts the app, so the link exists while there is still no tree to put it in)
// and read by `readDeepLink` when the catalogue mounts. Once there IS a
// listener the link goes straight to it and nothing is kept - otherwise a later
// remount would replay a tile the user opened minutes ago.
let pending: DeepLink | null = null;
const listeners = new Set<(link: DeepLink) => void>();

/** Open `link`, from outside React. Called by a shell (see the native TV app's
 * `lib/launcher-links`). */
export function requestDeepLink(link: DeepLink): void {
  if (listeners.size === 0) {
    pending = link;
    return;
  }
  for (const listener of listeners) listener(link);
}

/** The link a shell pushed before the app was listening, once. */
function takePendingDeepLink(): DeepLink | null {
  const link = pending;
  pending = null;
  return link;
}

/** The tile selection that launched/targeted the app, or null. */
export function readDeepLink(): DeepLink | null {
  const t = tizen();
  if (!t) return takePendingDeepLink();
  try {
    const req = t.application.getCurrentApplication().getRequestedAppControl();
    const payload = req?.appControl.data.find((d) => d.key === 'PAYLOAD')?.value?.[0];
    return payload ? parsePayload(payload) : null;
  } catch {
    return null;
  }
}

/** Fire `cb` when the running app is re-targeted by a preview tile. The cold
 *  launch is covered by readDeepLink(); this handles selection while open.
 *  Returns a cleanup function. */
export function onDeepLink(cb: (link: DeepLink) => void): () => void {
  // The shell bus first: it is the only source on the native TV clients, and it
  // is where a link pushed while the app was starting is waiting.
  listeners.add(cb);
  const link = takePendingDeepLink();
  if (link) cb(link);
  const unsubscribe = () => {
    listeners.delete(cb);
  };

  // The sources below are WebView-shell events, so the native TV clients have
  // nothing to subscribe to. Testing `window` alone is not enough to detect
  // them: React Native defines `window` as an alias of `global`, and only trips
  // over `addEventListener` missing from it.
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return unsubscribe;
  }
  // Tizen warm start: the platform re-targets the running app with a new
  // appControl when another preview tile is selected.
  if (!tizen()) return unsubscribe;
  const handler = () => {
    const link = readDeepLink();
    if (link) cb(link);
  };
  window.addEventListener('appcontrol', handler);
  return () => {
    unsubscribe();
    window.removeEventListener('appcontrol', handler);
  };
}
