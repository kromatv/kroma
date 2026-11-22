import { routeUnder } from '@kromatv/core';

const KEPT = [
  '/account',
  '/connect',
  '/discover',
  '/invite',
  '/requests',
  '/trending',
  '/whats-new',
] as const;

/** Whether `pathname` is a page a Kids session never opens: account settings,
 *  pairing a device, discovery and requests (ACCT-137, ACCT-138). */
export function keptFromKids(pathname: string): boolean {
  return routeUnder(pathname, KEPT);
}
