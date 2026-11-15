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
