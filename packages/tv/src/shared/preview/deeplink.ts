// Decoding the tile selection that launched or re-targeted the app.

import { z } from 'zod';
import { tizen } from '#tv/shared/preview/tizen';
import type { DeepLink } from '#tv/shared/preview/types';

// A launcher payload is written by the platform, not by KROMA, so both the
// bytes and the id inside them are bounded before either reaches a URL.
const MAX_PAYLOAD_LEN = 8192;
const MAX_ID_LEN = 128;

const Link = z.object({
  type: z.enum(['movie', 'show']),
  id: z.string().min(1).max(MAX_ID_LEN),
});

// Tizen delivers `action_data` either verbatim or wrapped as
// `{"values": "<uri-encoded JSON>"}`; handle both.
const Wrapped = z.object({ values: z.string() });

function parsePayload(raw: string): DeepLink | null {
  if (raw.length > MAX_PAYLOAD_LEN) return null;
  try {
    const first: unknown = JSON.parse(raw);
    const direct = Link.safeParse(first);
    if (direct.success) return direct.data;
    const wrapped = Wrapped.safeParse(first);
    if (!wrapped.success) return null;
    const inner = Link.safeParse(JSON.parse(decodeURIComponent(wrapped.data.values)));
    return inner.success ? inner.data : null;
  } catch {
    return null;
  }
}

/** Owns links delivered before this catalogue mounts. */
export function createDeepLinks() {
  // A link pushed before anyone is listening is kept and read once the catalogue
  // mounts (a launcher tile cold-starts the app); with a listener it is delivered
  // and not kept, or a remount would replay an old tile.
  let pending: DeepLink | null = null;
  const listeners = new Set<(link: DeepLink) => void>();

  /** Open `link` from outside React; called by a shell. */
  function requestDeepLink(link: DeepLink): void {
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
  function readDeepLink(): DeepLink | null {
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
  function onDeepLink(cb: (link: DeepLink) => void): () => void {
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

  return { requestDeepLink, readDeepLink, onDeepLink };
}
export type DeepLinks = ReturnType<typeof createDeepLinks>;
