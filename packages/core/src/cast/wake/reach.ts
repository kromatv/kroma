import { webSocket } from './socket';

/** What an answer from a device on the network carried. */
export interface WakeAnswer {
  status: number;
  text: string;
}

/** A conversation with a device on the network, one text frame at a time. */
export interface LanSocket {
  send: (text: string) => Promise<void>;
  /** The next frame the device sends. Rejects when none came within
   * `withinMs`, or when the device closed the conversation. */
  next: (withinMs: number) => Promise<string>;
  close: () => void;
}

/** Where what a television gave when a person accepted this device on its
 * screen is kept, by the television's address. A television asks nobody again
 * while what it gave is sent back to it. */
export interface WakeKeys {
  get: (address: string) => Promise<string | null>;
  set: (address: string, key: string) => Promise<void>;
}

/**
 * What this platform can do to a television on its own network. How each
 * make of television is spoken to is written once, on top of this, so a
 * platform provides the means and never the protocol.
 */
export interface WakeReach {
  /** An HTTP request to a device on the network, or `null` when nothing answered. */
  http: (method: 'GET' | 'POST', url: string) => Promise<WakeAnswer | null>;
  /** Open a WebSocket to a device on the network. Rejects when it does not
   * answer. A television's own services sit behind a certificate the set
   * signed for itself: a native app's socket accepts it, a page's does not,
   * so there a `wss` address is refused. */
  open: (url: string) => Promise<LanSocket>;
  /** Broadcast a Wake-on-LAN packet for this hardware address. A page has no
   * datagram, so it has none. */
  magic?: (mac: string) => Promise<void>;
  /** Without it a television asks a person again on every connection. */
  keys?: WakeKeys;
}

/**
 * How one pass over a step ended. `asked` means something was sent and the
 * television may now be on its way; `needsPower` means a person has to act on
 * the television, because this platform cannot switch it on or the television
 * waits for somebody to accept this device; `refused` means the television
 * answered that it cannot do what was asked, and asking again will not change
 * that.
 */
export type WakeResult = 'asked' | 'needsPower' | 'refused' | 'skipped';

/** Send the packet where the platform can, or say that a person is needed. */
export async function sendPacket(mac: string | undefined, reach: WakeReach): Promise<WakeResult> {
  if (!(mac && reach.magic)) {
    return 'needsPower';
  }
  await reach.magic(mac);
  return 'asked';
}

const HTTP_TIMEOUT_MS = 3000;

/** The reach every platform has: HTTP and the platform's own WebSocket. A
 * request that fails, is refused or takes longer than three seconds is nothing
 * answering. */
export const httpReach: WakeReach = {
  http: async (method, url) => {
    try {
      const reply = await fetch(url, { method, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
      return { status: reply.status, text: await reply.text() };
    } catch {
      return null;
    }
  },
  open: webSocket,
};
