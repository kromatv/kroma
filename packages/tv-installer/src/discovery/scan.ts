import { identify } from '../modules/identify';
import { detailPorts, modules, searchTargets, sweepPorts } from '../modules/registry';
import type { Television } from '../television';
import { arpHosts } from './arp';
import { compareHosts, localSubnets, prefixOf, subnetHosts } from './lan';
import { mapPool } from './pool';
import { ssdpSearch } from './ssdp';
import { tcpOpen } from './tcp';
import { fetchDeviceDescription, type UpnpDevice } from './upnp';

const CONNECT_TIMEOUT_MS = 500;
const HOST_CONCURRENCY = 64;
const SSDP_WINDOW_MS = 2000;
const BETWEEN_ROUNDS_MS = 1500;

export interface ScanOptions {
  hosts?: readonly string[];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onFound?: (tv: Television) => void;
}

export interface WatchOptions extends ScanOptions {
  onRound?: (round: number) => void;
}

/** One pass over the network. */
export async function scan(options: ScanOptions = {}): Promise<Television[]> {
  const found: Television[] = [];
  const discovered = Promise.all(modules().map(async (module) => module.discover?.() ?? []));
  const announced = ssdpSearch(SSDP_WINDOW_MS, options.signal, searchTargets());
  const targets = options.hosts?.length ? [...options.hosts] : await sweepTargets();

  for (const television of (await discovered).flat()) {
    if (options.hosts?.length && !options.hosts.includes(television.host)) continue;
    found.push(television);
    options.onFound?.(television);
  }

  const upnp = new Map<string, UpnpDevice>();
  let done = 0;
  const visit = async (host: string) => {
    const television = await examine(host, upnp.get(host), options.signal);
    options.onProgress?.(Math.min(++done, targets.length), targets.length);
    if (!television) return;
    found.push(television);
    options.onFound?.(television);
  };

  await mapPool(targets, HOST_CONCURRENCY, (host) =>
    options.signal?.aborted ? Promise.resolve() : visit(host),
  );

  // A set that answered a port was identified before its description arrived,
  // so it is asked again once there is a name and a model to give it.
  for (const [host, device] of await describe(await announced)) {
    upnp.set(host, device);
    const television = await examine(host, device, options.signal);
    if (!television) continue;

    const at = found.findIndex((seen) => seen.host === host);
    if (at === -1) found.push(television);
    else found[at] = television;
    options.onFound?.(television);
  }
  return found.sort(byHost);
}

/**
 * Scans again and again until the signal aborts, reporting a set the first time
 * it answers and every time what it says about itself changes.
 */
export async function watch(options: WatchOptions): Promise<Television[]> {
  const seen = new Map<string, Television>();
  let round = 0;
  while (!options.signal?.aborted) {
    round += 1;
    options.onRound?.(round);
    await scan({
      ...options,
      onFound: (tv) => {
        const before = seen.get(tv.host);
        seen.set(tv.host, tv);
        if (before?.developerMode !== tv.developerMode || before?.name !== tv.name) {
          options.onFound?.(tv);
        }
      },
    });
    if (options.signal?.aborted) break;
    await rest(BETWEEN_ROUNDS_MS, options.signal);
  }
  return [...seen.values()].sort(byHost);
}

/** The hosts this machine already knows first, then the rest of its own /24s. */
export async function sweepTargets(): Promise<string[]> {
  const subnets = localSubnets();
  const prefixes = new Set(subnets.map((subnet) => subnet.prefix));
  const known = (await arpHosts()).filter((host) => {
    const prefix = prefixOf(host);
    return prefix !== null && prefixes.has(prefix);
  });

  const rest = subnets.flatMap((subnet) =>
    subnetHosts(subnet.prefix, subnet.address).filter((host) => !known.includes(host)),
  );
  return [...known, ...rest];
}

async function examine(
  host: string,
  upnp: UpnpDevice | undefined,
  signal?: AbortSignal,
): Promise<Television | null> {
  const ports = await openOf(host, sweepPorts());
  if (ports.size === 0 && !upnp) return null;
  if (signal?.aborted) return null;

  for (const port of await openOf(host, detailPorts())) ports.add(port);
  return identify(host, ports, upnp);
}

async function openOf(host: string, ports: readonly number[]): Promise<Set<number>> {
  const reachable = await Promise.all(
    ports.map(async (port) => ((await tcpOpen(host, port, CONNECT_TIMEOUT_MS)) ? port : null)),
  );
  return new Set(reachable.filter((port): port is number => port !== null));
}

async function describe(replies: Awaited<ReturnType<typeof ssdpSearch>>) {
  const byHost = new Map<string, UpnpDevice>();
  const seen = new Set<string>();
  const first = replies.filter((reply) => {
    if (seen.has(reply.host)) return false;
    seen.add(reply.host);
    return true;
  });
  await mapPool(first, 8, async (reply) => {
    const device = await fetchDeviceDescription(reply.location);
    if (device) byHost.set(reply.host, device);
  });
  return byHost;
}

function rest(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

function byHost(a: Television, b: Television): number {
  return compareHosts(a.host, b.host);
}
