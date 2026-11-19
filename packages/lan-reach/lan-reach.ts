// The JS face of what a native app can do to a television on its own network
// beyond HTTP, shaped as the two optional halves of the `WakeReach` that
// `@kromatv/core` defines.
//
// `requireOptionalNativeModule`, like the beacon beside it: a build without the
// native half gets null rather than a throw, and null IS the capability check.
// A shell with no module runs the steps over HTTP alone, as a browser does.

import type { WakeReach } from '@kromatv/core';
import { type NativeModule, requireOptionalNativeModule } from 'expo';

declare class LanReachNativeModule extends NativeModule {
  // Presses one remote key on a Samsung set and resolves with the token the
  // set answered the connection with, which it gives once somebody accepted
  // the prompt on its screen. Rejects when the set refused or did not answer.
  samsungKey(address: string, key: string, token: string | null): Promise<string | null>;
  magic(mac: string): Promise<void>;
}

/** Where the token a Samsung set gave is kept, by the set's address. The set
 * asks nobody again while the token it gave is sent back to it. */
export interface TokenStore {
  get: (address: string) => Promise<string | null>;
  set: (address: string, token: string) => Promise<void>;
}

const native = requireOptionalNativeModule<LanReachNativeModule>('LanReach');

function reach(module: LanReachNativeModule, tokens: TokenStore): NativeReach {
  return {
    samsungKey: async (address, key) => {
      const given = await module.samsungKey(address, key, await tokens.get(address));
      if (given) {
        await tokens.set(address, given);
      }
    },
    magic: (mac) => module.magic(mac),
  };
}

/** The halves of a `WakeReach` only a native app has. */
export type NativeReach = Required<Pick<WakeReach, 'samsungKey' | 'magic'>>;

/**
 * This device's reach beyond HTTP, or null on a target without the native
 * half. Spread it over `httpReach` and hand the result to `<CastProvider>`.
 */
export function lanReach(tokens: TokenStore): NativeReach | null {
  return native ? reach(native, tokens) : null;
}
