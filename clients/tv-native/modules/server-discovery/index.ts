// JS face of the local DNS-SD browser.
//
// `requireOptionalNativeModule`, like the launcher module: a build without it
// (a browser shell, an old binary) gets null rather than a throw, and null is
// the capability check - no module, no browse, and discovery falls back to the
// subnet sweep it has always used.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

/** One server, as the network described it. No scheme: mDNS does not know
 *  whether the port speaks TLS, and guessing is what `resolveServerOrigin`
 *  exists to avoid. */
export interface BrowsedServer {
  // The advertised instance name ("KROMA"), for a picker with two servers.
  name: string;
  host: string;
  port: number;
}

declare class ServerDiscoveryNativeModule extends NativeModule {
  // Browse `_kroma._tcp` for `timeoutMs`, then answer with everything that
  // resolved. Never rejects: a network that cannot multicast answers empty.
  browse(timeoutMs: number): Promise<BrowsedServer[]>;
}

const native = requireOptionalNativeModule<ServerDiscoveryNativeModule>('ServerDiscovery');

/**
 * Ask the network where the servers are, or null on a target without the module.
 *
 * Shaped as the `browse` hook `discoverServer` takes, so the shell can hand it
 * over without @kroma/tv or @kroma/core ever importing a native module.
 */
export const browseForServers: ((timeoutMs: number) => Promise<BrowsedServer[]>) | null = native
  ? (timeoutMs: number) => native.browse(timeoutMs)
  : null;
