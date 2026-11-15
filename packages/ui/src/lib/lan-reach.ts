import { isLanRoute, type LanPermission } from '@kromatv/core';

const HTTP_ORIGIN = /^http:\/\/[^/?#]+/;

const urlOf = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
};

const onHttpsPage = () => globalThis.location?.protocol === 'https:';

/** Whether this app may reach its own network over plain http without asking.
 * Anywhere but an https page (a native app, a packaged television, an http
 * page) it may; an https page answers from the browser's `local-network`
 * permission, and a browser that has none is `unsupported`. */
export async function lanPermission(): Promise<LanPermission> {
  if (!onHttpsPage()) return 'granted';
  const permissions = globalThis.navigator?.permissions;
  if (!permissions) return 'unsupported';
  try {
    // Never `local-network-access`: older Chrome crashes the renderer on it,
    // past any try/catch.
    const status = await permissions.query({ name: 'local-network' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

/** `fetch`, telling the browser that a request to a private address is meant
 * for the local network (Chrome's `targetAddressSpace: 'local'`), which an
 * https page needs for it to pass mixed-content blocking once the person
 * allowed it. Anywhere else it is `fetchFn` itself: Chromium 124 to 138 read
 * `'local'` as loopback and fail every request to a private address that
 * carries it (docs/reference/direct-connection-platforms.md). */
export function withLocalAddressSpace(fetchFn: typeof globalThis.fetch): typeof globalThis.fetch {
  if (!onHttpsPage()) return fetchFn;
  return (input, init) =>
    isLanRoute(HTTP_ORIGIN.exec(urlOf(input))?.[0] ?? '')
      ? fetchFn(input, { ...init, targetAddressSpace: 'local' } as RequestInit)
      : fetchFn(input, init);
}

/** Calls `listener` whenever the platform says the device is back online (a
 * browser's `online` event). A platform that says nothing never calls it. */
export function onOnline(listener: () => void): () => void {
  const target = globalThis as Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>>;
  if (typeof target.addEventListener !== 'function') return () => undefined;
  target.addEventListener('online', listener);
  return () => target.removeEventListener?.('online', listener);
}

/** Whether a URL handed to a player or an image may follow a direct route: not
 * on an https page, where the browser blocks an `http://` media element as
 * mixed content. */
export function mediaFollowsDirectRoute(): boolean {
  return !onHttpsPage();
}
