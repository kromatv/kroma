import { createSocket, type Socket } from 'node:dgram';
import { arpHosts } from './discovery/arp';
import { localSubnets } from './discovery/lan';
import { connect } from './discovery/tcp';
import { run } from './run';

export const PRIVACY_PANE =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork';

const DISCARD_PORT = 9;
const PROBE_TIMEOUT_MS = 600;
// An address nobody answers at cannot refuse a connection: the packet goes out
// and nothing comes back, which is a timeout. A refusal that fast is the system
// answering on its behalf, which is what a denied Local Network permission does.
const TOO_FAST_TO_BE_THE_NETWORK_MS = 100;
const NOBODY_HOME = [253, 252, 251];

/** macOS only: whether this process is being refused the local network outright. */
export async function localNetworkBlocked(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;

  const known = new Set(await arpHosts());
  const targets = localSubnets()
    .flatMap((subnet) => NOBODY_HOME.map((last) => `${subnet.prefix}.${last}`))
    .filter((host) => !known.has(host))
    .slice(0, 2);
  if (targets.length === 0) return false;

  const results = await Promise.all(
    targets.map((host) => connect(host, DISCARD_PORT, PROBE_TIMEOUT_MS)),
  );
  return results.every(
    (result) => result.outcome === 'refused' && result.ms < TOO_FAST_TO_BE_THE_NETWORK_MS,
  );
}

const APP_BUNDLE = /\/([^/]+)\.app\/Contents\/MacOS\//;
const PROCESS_LINE = /^[ \t]*(\d+)[ \t]+(\S.*)$/;
const MAX_DEPTH = 12;

/**
 * The application macOS holds responsible for what this process does, which is
 * the entry to allow in the Local Network list: a terminal, an editor, an IDE.
 */
export async function responsibleApp(): Promise<string | null> {
  if (process.platform !== 'darwin') return null;

  let pid = process.pid;
  for (let depth = 0; depth < MAX_DEPTH && pid > 1; depth++) {
    const { code, output } = await run(['ps', '-o', 'ppid=,comm=', '-p', String(pid)], {
      timeoutMs: 2000,
    });
    const [, parent, command] = PROCESS_LINE.exec(output.trim()) ?? [];
    if (code !== 0 || !parent || !command) return null;

    const app = APP_BUNDLE.exec(command)?.[1];
    if (app) return app;
    pid = Number(parent);
  }
  return null;
}

export async function openPrivacySettings(): Promise<boolean> {
  const { code } = await run(['open', PRIVACY_PANE], { timeoutMs: 5000 });
  return code === 0;
}

const MDNS_MULTICAST_GROUP = '224.0.0.251';
const MDNS_PORT = 5353;
const SETTLE_MS = 300;

export function mdnsQuery(name: string): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  const labels = name.split('.').map((label) => {
    const bytes = Buffer.from(label, 'ascii');
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  const question = Buffer.alloc(5);
  question.writeUInt16BE(12, 1);
  question.writeUInt16BE(1, 3);
  return Buffer.concat([header, ...labels, question]);
}

function queryOn(socket: Socket, address: string, query: Buffer): void {
  try {
    socket.setMulticastInterface(address);
    socket.send(query, MDNS_PORT, MDNS_MULTICAST_GROUP, () => undefined);
  } catch {
    return;
  }
}

/**
 * Multicasts one mDNS query per interface. macOS lists an app under Local
 * Network only once it has asked, and the list cannot be added to by hand, so
 * this is what puts the responsible app there for the switch to be flipped.
 */
export async function askForLocalNetwork(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const subnets = localSubnets();
  if (subnets.length === 0) return;

  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', () => undefined);
  await new Promise<void>((resolve) => socket.bind(resolve));

  const query = mdnsQuery('_services._dns-sd._udp.local');
  for (const subnet of subnets) queryOn(socket, subnet.address, query);

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  socket.close();
}
