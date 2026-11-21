import { httpReach, type WakeKeys, type WakeReach } from '@kromatv/core';

function keyFor(address: string): string {
  return `kroma.tv-key.${address}`;
}

// A browser that refuses storage keeps nothing, and the television asks again.
const keys: WakeKeys = {
  get: async (address) => {
    try {
      return localStorage.getItem(keyFor(address));
    } catch {
      return null;
    }
  },
  set: async (address, key) => {
    try {
      localStorage.setItem(keyFor(address), key);
    } catch {
      /* nothing kept */
    }
  },
};

/** What a page can do to a television on its network: HTTP and its own
 * WebSocket, with what a television gave when it was accepted on its screen
 * kept in this browser. */
export const tvReach: WakeReach = { ...httpReach, keys };
