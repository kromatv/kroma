// Where the server ANNOUNCES itself, for the shells that can hear it.
//
// The server has advertised `_kroma._tcp` over DNS-SD for as long as the mDNS
// module has existed (server/modules/tv.kroma.mdns), carrying its real host and
// its real port. No client ever listened, so discovery fell back to trying the
// hostname `kroma.local` and then sweeping 253 addresses of the local /24 on
// port 4040 - slow, /24-only, and structurally unable to find a server on any
// other port or behind a reverse proxy on 443.
//
// Listening needs a native resolver (NsdManager on Android, NWBrowser on Apple),
// so it is registered rather than imported - the same dependency injection as
// the voice-search backend next door. A browser shell registers nothing: Tizen
// and webOS cannot browse mDNS from JavaScript at all, and they keep the sweep.
//
// The browse answers with hosts and PORTS. It deliberately says nothing about
// http vs https, because mDNS does not know: `resolveServerOrigin` settles that
// by asking, which is also what gets an http-to-https redirect right.

/** One server, as the network described it. */
export interface AnnouncedServer {
  /** The advertised instance name ("KROMA"). */
  name?: string;
  host: string;
  port: number;
}

export type ServerBrowse = (timeoutMs: number) => Promise<AnnouncedServer[]>;

let current: ServerBrowse | null = null;

/** Register the shell's DNS-SD browser. Call once at the app root, before the
 * first render. Passing null removes it (what a test does to get back to the
 * sweep-only default). */
export function setServerBrowse(browse: ServerBrowse | null): void {
  current = browse;
}

/** The registered browser, or null on a target that cannot browse. */
export function serverBrowse(): ServerBrowse | null {
  return current;
}
