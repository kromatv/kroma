import { httpReach, type WakeReach } from '@kromatv/core';
import { lanReach, type TokenStore } from '@kromatv/lan-reach';
import * as SecureStore from 'expo-secure-store';

function keyFor(address: string): string {
  return `kroma.tv-token.${address}`;
}

const tokens: TokenStore = {
  get: (address) => SecureStore.getItemAsync(keyFor(address)),
  set: (address, token) => SecureStore.setItemAsync(keyFor(address), token),
};

/** What this phone can do to a television on its network: HTTP, and where the
 * binary carries the native half, the Samsung power key and the Wake-on-LAN
 * packet. A browser has the first alone. */
export const tvReach: WakeReach = { ...httpReach, ...lanReach(tokens) };
