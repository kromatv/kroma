import { httpReach, type WakeKeys, type WakeReach } from '@kromatv/core';
import { lanReach } from '@kromatv/lan-reach';
import * as SecureStore from 'expo-secure-store';

function keyFor(address: string): string {
  return `kroma.tv-key.${address}`;
}

const keys: WakeKeys = {
  get: (address) => SecureStore.getItemAsync(keyFor(address)),
  set: (address, key) => SecureStore.setItemAsync(keyFor(address), key),
};

/** What this phone can do to a television on its network. Where the binary
 * carries the native half, its socket accepts a television's own certificate
 * and it can send the Wake-on-LAN packet; what a television gave when it was
 * accepted on its screen is kept in the keychain. */
export const tvReach: WakeReach = { ...httpReach, ...lanReach(), keys };
