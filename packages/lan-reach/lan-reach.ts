// The JS face of what a native app can do to a television on its own network
// beyond what a page can: a WebSocket that accepts the certificate a television
// signed for itself, and a Wake-on-LAN packet. They are two of the means the
// `WakeReach` in `@kromatv/core` asks a platform for; how each make of
// television is spoken to over them is written there, once.
//
// `requireOptionalNativeModule`, like the beacon beside it: a build without the
// native half gets null rather than a throw, and null IS the capability check.
// A shell with no module has the platform's own WebSocket, as a browser does.

import type { LanSocket, WakeReach } from '@kromatv/core';
import { type NativeModule, requireOptionalNativeModule } from 'expo';

declare class LanReachNativeModule extends NativeModule {
  // Resolves with a handle once the device accepted the connection.
  open(url: string): Promise<number>;
  send(socket: number, text: string): Promise<void>;
  // Rejects, and ends the conversation, when no text frame came in time.
  receive(socket: number, withinMs: number): Promise<string>;
  close(socket: number): Promise<void>;
  magic(mac: string): Promise<void>;
}

const native = requireOptionalNativeModule<LanReachNativeModule>('LanReach');

async function open(module: LanReachNativeModule, url: string): Promise<LanSocket> {
  const socket = await module.open(url);
  return {
    send: (text) => module.send(socket, text),
    next: (withinMs) => module.receive(socket, withinMs),
    close: () => {
      void module.close(socket).catch(() => undefined);
    },
  };
}

/** The means of a `WakeReach` only a native app has. */
export type NativeReach = Required<Pick<WakeReach, 'open' | 'magic'>>;

/**
 * This device's reach beyond a page's, or null on a target without the native
 * half. Spread it over `httpReach` and hand the result to `<CastProvider>`.
 */
export function lanReach(): NativeReach | null {
  if (!native) {
    return null;
  }
  const module = native;
  return {
    open: (url) => open(module, url),
    magic: (mac) => module.magic(mac),
  };
}
