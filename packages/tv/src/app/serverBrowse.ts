// The server advertises `_kroma._tcp` over DNS-SD with its real host and port.
// Listening needs a native resolver (NsdManager on Android, NWBrowser on Apple),
// so it is registered rather than imported, like the voice-search backend next
// door; Tizen and webOS cannot browse mDNS from JavaScript and keep the
// LAN-sweep fallback instead.
//
// The browse answers with host and port only, never http vs https (mDNS
// doesn't know): `resolveServerOrigin` settles that by asking.

export interface AnnouncedServer {
  name?: string;
  host: string;
  port: number;
}

export type ServerBrowse = (timeoutMs: number) => Promise<AnnouncedServer[]>;

let current: ServerBrowse | null = null;

/** Call once at the app root, before the first render; null restores the
 * sweep-only default. */
export function setServerBrowse(browse: ServerBrowse | null): void {
  current = browse;
}

/** The registered browser, or null on a target that cannot browse. */
export function serverBrowse(): ServerBrowse | null {
  return current;
}
