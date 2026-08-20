// LAN auto-discovery for the KROMA server. Browsers and TV webviews cannot
// browse mDNS from JavaScript, hence the named candidates and the /24 sweep.

import { type HealthProbe, probeAll, raceForServer, stripTrailingSlash } from './health-probe';
import { getLocalIPv4 } from './local-ip';
import { resolveServerOrigin } from './server-origin';

export { getLocalIPv4 } from './local-ip';
export { type ResolvedOrigin, resolveServerOrigin } from './server-origin';

export interface DiscoverOptions {
  candidates?: string[];
  timeoutMs?: number;
  scanSubnet?: boolean;
  port?: number;
  concurrency?: number;
  localIp?: string;
  fetch?: typeof globalThis.fetch;
  browse?: (timeoutMs: number) => Promise<Array<{ host: string; port: number; name?: string }>>;
  browseMs?: number;
}

export const DEFAULT_DISCOVERY_CANDIDATES = ['http://kroma.local:4040'];

export async function discoverServer(opts: DiscoverOptions = {}): Promise<string | null> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const port = opts.port ?? 4040;

  // Browse and named candidates run concurrently: wifi that blocks multicast
  // makes the browse cost its full timeout, so the worst case is the slower of
  // the two rather than their sum. A browse hit still wins when it answers.
  const named = (opts.candidates ?? DEFAULT_DISCOVERY_CANDIDATES).map(stripTrailingSlash);
  const [announced, namedHit] = await Promise.all([
    browsedOrigins(opts, fetchFn),
    raceForServer(named, fetchFn, opts.timeoutMs ?? 2000),
  ]);
  if (announced.length > 0) return announced[0] ?? null;
  if (namedHit) return namedHit;

  if (opts.scanSubnet !== false) {
    const ip = opts.localIp ?? (await getLocalIPv4());
    if (ip) {
      const hosts = subnetCandidates(ip, port);
      const scanHit = await raceForServer(
        hosts,
        fetchFn,
        opts.timeoutMs ?? 1500,
        opts.concurrency ?? 48,
      );
      if (scanHit) return scanHit;
    }
  }
  return null;
}

// A browse that throws is a browse that found nothing: it sits in front of two
// working fallbacks and must never be the reason discovery fails.
async function browsedOrigins(
  opts: DiscoverOptions,
  fetchFn: typeof globalThis.fetch,
): Promise<string[]> {
  if (!opts.browse) return [];
  let announced: Array<{ host: string; port: number }> = [];
  try {
    announced = await opts.browse(opts.browseMs ?? 1500);
  } catch {
    return [];
  }
  const resolved = await Promise.all(
    announced.map((service) =>
      resolveServerOrigin(`${service.host}:${service.port}`, {
        fetch: fetchFn,
        timeoutMs: opts.timeoutMs ?? 2000,
      }),
    ),
  );
  return resolved.filter((hit) => hit !== null).map((hit) => hit.url);
}

export interface DiscoveredServer {
  url: string;
  name?: string;
  version?: string;
  instanceId?: string;
}

// The fingerprint fallback (servers too old to send an `instanceId`) is a guess,
// so it is namespaced and cannot collide with a real id.
function identityOf(body: HealthProbe): string {
  if (body.instanceId) return `id:${body.instanceId}`;
  return `fp:${[body.name, body.version, body.libraries, body.items, body.shows].join('|')}`;
}

/** Every live KROMA server on the network. Duplicate answers for one server
 *  (its mDNS name and its IP) collapse on identity, keeping the first origin. */
export async function discoverServers(opts: DiscoverOptions = {}): Promise<DiscoveredServer[]> {
  const fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return [];
  const port = opts.port ?? 4040;

  const named = (opts.candidates ?? DEFAULT_DISCOVERY_CANDIDATES).map(stripTrailingSlash);
  const subnet = async () => {
    if (opts.scanSubnet === false) return [];
    const ip = opts.localIp ?? (await getLocalIPv4());
    if (!ip) return [];
    return probeAll(
      subnetCandidates(ip, port),
      fetchFn,
      opts.timeoutMs ?? 1500,
      opts.concurrency ?? 48,
    );
  };
  // Announced servers come first: a published origin is the only one that can
  // carry a non-default port or a TLS front door.
  const announced = async () => {
    const origins = await browsedOrigins(opts, fetchFn);
    return probeAll(origins, fetchFn, opts.timeoutMs ?? 2000, Math.max(1, origins.length));
  };
  // Named candidates stay ahead of the sweep so a `.local` origin wins over the
  // bare IP for the same server.
  const [announcedHits, namedHits, subnetHits] = await Promise.all([
    announced(),
    probeAll(named, fetchFn, opts.timeoutMs ?? 2000, named.length),
    subnet(),
  ]);

  const seen = new Set<string>();
  const found: DiscoveredServer[] = [];
  for (const hit of [...announcedHits, ...namedHits, ...subnetHits]) {
    const key = identityOf(hit.body);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      url: hit.url,
      name: hit.body.name,
      version: hit.body.version,
      instanceId: hit.body.instanceId,
    });
  }
  return found;
}

/** Every `http://<prefix>.1..254:<port>` origin in the /24 containing `ip`,
 *  excluding the device's own address. */
export function subnetCandidates(ip: string, port = 4040): string[] {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return [];
  const prefix = m[1];
  const self = Number(m[2]);
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) {
    if (i !== self) hosts.push(`http://${prefix}.${i}:${port}`);
  }
  return hosts;
}
