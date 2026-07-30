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

// Tizen delivers `action_data` either verbatim or wrapped as
// `{"values": "<uri-encoded JSON>"}`; handle both.
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

// A link pushed before anyone is listening is kept and read once the catalogue
// mounts (a launcher tile cold-starts the app); with a listener it is delivered
// and not kept, or a remount would replay an old tile.
let pending: DeepLink | null = null;
const listeners = new Set<(link: DeepLink) => void>();

/** Open `link` from outside React; called by a shell. */
export function requestDeepLink(link: DeepLink): void {
  if (listeners.size === 0) {
    pending = link;
    return;
  }
  for (const listener of listeners) listener(link);
}

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

/** Fire `cb` when the running app is re-targeted by a preview tile; the cold
 *  launch is covered by readDeepLink(). Returns a cleanup function. */
export function onDeepLink(cb: (link: DeepLink) => void): () => void {
  listeners.add(cb);
  const link = takePendingDeepLink();
  if (link) cb(link);
  const unsubscribe = () => {
    listeners.delete(cb);
  };

  // Testing `window` alone would not detect the WebView shell: React Native
  // defines `window` as an alias of `global`, without `addEventListener`.
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
