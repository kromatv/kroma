import { createSocket, type Socket } from 'node:dgram';
import { DNS_TYPE, type DnsQuestion, encodeQuery, parseResponse } from './dns';
import { localSubnets, prefixOf, type Subnet } from './lan';

const MDNS_GROUP = '224.0.0.251';
const MDNS_PORT = 5353;
const ASK_AGAIN_MS = 1000;
const DOMAIN = 'local';

/** One service a device on this network says it offers. */
export interface MdnsService {
  host: string;
  type: string;
  instance: string;
  port: number;
}

export interface BrowseOptions {
  durationMs: number;
  signal?: AbortSignal;
  hosts?: readonly string[];
  onService?: (service: MdnsService) => void;
}

function typeOf(name: string, types: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  return types.find((type) => lower.endsWith(`.${type}.${DOMAIN}`.toLowerCase()));
}

function bound(port: number, address?: string): Promise<Socket | null> {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  return new Promise((resolve) => {
    socket.once('error', () => {
      socket.close();
      resolve(null);
    });
    socket.bind(port, address, () => {
      socket.removeAllListeners('error');
      socket.on('error', () => undefined);
      resolve(socket);
    });
  });
}

interface Asker {
  socket: Socket;
  reaches: (host: string) => boolean;
}

async function asker(
  subnet: Subnet | undefined,
  known: ReadonlySet<string>,
): Promise<Asker | null> {
  const socket = await bound(0, subnet?.address);
  if (!socket) return null;
  try {
    if (subnet) socket.setMulticastInterface(subnet.address);
  } catch {
    socket.close();
    return null;
  }
  const reaches = (host: string) => {
    const prefix = prefixOf(host) ?? '';
    return !subnet || prefix === subnet.prefix || !known.has(prefix);
  };
  return { socket, reaches };
}

async function listener(addresses: readonly string[]): Promise<Socket | null> {
  const socket = await bound(MDNS_PORT);
  if (!socket) return null;
  let joined = 0;
  for (const address of addresses) {
    try {
      socket.addMembership(MDNS_GROUP, address);
      joined += 1;
    } catch {
      continue;
    }
  }
  if (joined > 0) return socket;
  socket.close();
  return null;
}

/**
 * Asks the network who offers the service types given, such as `_adb._tcp`,
 * and answers every instance that named its port before the window closed.
 * The `hosts` given are asked directly too, which reaches a device the
 * network's multicast does not. A silent network is no error.
 */
export async function mdnsBrowse(
  types: readonly string[],
  options: BrowseOptions,
): Promise<MdnsService[]> {
  if (types.length === 0 || options.signal?.aborted) return [];
  const subnets = localSubnets();
  const known = new Set(subnets.map((subnet) => subnet.prefix));
  const opened = await Promise.all(
    (subnets.length > 0 ? subnets : [undefined]).map((subnet) => asker(subnet, known)),
  );
  const askers = opened.filter((one) => one !== null);
  const shared = await listener(subnets.map((subnet) => subnet.address));
  const sockets = [...askers.map((one) => one.socket), ...(shared ? [shared] : [])];

  const found = new Map<string, MdnsService>();
  const ports = new Map<string, number>();
  const pending = new Map<string, { host: string; type: string }>();

  const settle = (name: string) => {
    const waiting = pending.get(name);
    const port = ports.get(name);
    if (!waiting || port === undefined) return;
    pending.delete(name);
    const instance = name.slice(0, name.length - `.${waiting.type}.${DOMAIN}`.length);
    const key = `${waiting.host}|${name.toLowerCase()}`;
    const changed = found.get(key)?.port !== port;
    const service = { ...waiting, instance, port };
    found.set(key, service);
    if (changed) options.onService?.(service);
  };

  const ask = (questions: readonly DnsQuestion[], direct: readonly string[] = []) => {
    for (const { socket, reaches } of askers) {
      const hosts = direct.filter(reaches);
      for (const question of questions) {
        const query = encodeQuery([question], true);
        socket.send(query, MDNS_PORT, MDNS_GROUP, () => undefined);
        for (const host of hosts) socket.send(query, MDNS_PORT, host, () => undefined);
      }
    }
  };

  const hear = (message: Buffer, from: { address: string }) => {
    const unresolved: DnsQuestion[] = [];
    for (const record of parseResponse(message)) {
      if (record.kind === 'srv') ports.set(record.name, record.port);
      if (record.kind !== 'ptr') continue;
      const type = typeOf(record.target, types);
      if (!type) continue;
      pending.set(record.target, { host: from.address, type });
      if (!ports.has(record.target)) unresolved.push({ name: record.target, type: DNS_TYPE.srv });
    }
    for (const name of [...pending.keys()]) settle(name);
    const still = unresolved.filter((question) => pending.has(question.name));
    if (still.length > 0) ask(still, [from.address]);
  };
  for (const socket of sockets) socket.on('message', hear);

  const browse = types.map((type) => ({ name: `${type}.${DOMAIN}`, type: DNS_TYPE.ptr }));
  ask(browse, options.hosts);
  const again = setInterval(() => ask(browse, options.hosts), ASK_AGAIN_MS);

  await listenFor(options.durationMs, options.signal);
  clearInterval(again);
  for (const socket of sockets) socket.close();
  return [...found.values()];
}

/**
 * The port one address offers a service on, as soon as it says so, or null
 * when the wait runs out.
 */
export async function mdnsPort(
  host: string,
  type: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<number | null> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  let port: number | null = null;
  await mdnsBrowse([type], {
    durationMs: timeoutMs,
    signal: controller.signal,
    hosts: [host],
    onService: (service) => {
      if (service.host !== host) return;
      port = service.port;
      stop();
    },
  });
  signal?.removeEventListener('abort', stop);
  return port;
}

function listenFor(ms: number, signal?: AbortSignal): Promise<void> {
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
