import { routeUnder } from '@kromatv/core';

const KEPT = [
  '/add-kids',
  '/connect-device',
  '/discover',
  '/edit-profile',
  '/profile-pin',
  '/settings/notifications',
] as const;

/** Whether `pathname` is a screen a Kids session never opens on the phone: its
 *  account settings and lock, pairing a television, discovery, and making a
 *  Kids profile (ACCT-137, ACCT-138). */
export function keptFromKids(pathname: string): boolean {
  return routeUnder(pathname, KEPT);
}
