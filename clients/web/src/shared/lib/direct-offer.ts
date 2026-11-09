import type { DirectState } from '@kromatv/core';

const DISMISSED = 'kroma.directOffer.dismissed';

/** Whether to offer the direct route: the server places this browser on its
 * network, only the browser's permission is missing, and the person has not
 * turned the offer down for this server. */
export function shouldOffer(state: DirectState, dismissed: boolean): boolean {
  return state.askable && !state.route && !dismissed;
}

/** The address a direct route goes to, for a technical line: `192.168.1.2`. */
export function routeHost(route: string): string {
  return route.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
}

const keyFor = (server: string) => `${DISMISSED}:${server}`;

/** Whether the offer was turned down for `server` (its configured base) on this
 * browser. Storage that cannot be read counts as never turned down. */
export function offerDismissed(server: string): boolean {
  try {
    return localStorage.getItem(keyFor(server)) === '1';
  } catch {
    return false;
  }
}

export function dismissOffer(server: string): void {
  try {
    localStorage.setItem(keyFor(server), '1');
  } catch {
    // Nowhere to keep it: the offer comes back on the next visit.
  }
}
