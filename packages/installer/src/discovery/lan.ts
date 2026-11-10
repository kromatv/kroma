import { networkInterfaces } from 'node:os';

// A television sits on the network the router hands out, and sweeping the
// virtual bridges beside it triples how long a scan takes for nothing.
const VIRTUAL = /^(bridge|utun|awdl|llw|anpi|ap\d|docker|virbr|br-|tun|tap|veth|zt|wg)/;

export interface Subnet {
  iface: string;
  address: string;
  prefix: string;
}

/** Every IPv4 network this machine sits on, one entry per interface. */
export function localSubnets(): Subnet[] {
  const out: Subnet[] = [];
  for (const [iface, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || VIRTUAL.test(iface)) continue;
      const prefix = prefixOf(entry.address);
      if (!prefix || out.some((s) => s.prefix === prefix)) continue;
      out.push({ iface, address: entry.address, prefix });
    }
  }
  return out;
}

/** `192.168.1.42` -> `192.168.1`, or null for anything that is not dotted-quad IPv4. */
export function prefixOf(address: string): string | null {
  const octets = address.split('.');
  if (octets.length !== 4) return null;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return null;
  return octets.slice(0, 3).join('.');
}

/** Addresses in numeric order, then the sets named rather than addressed. */
export function compareHosts(a: string, b: string): number {
  const left = hostKey(a);
  const right = hostKey(b);
  if (Number.isNaN(left) && Number.isNaN(right)) return a.localeCompare(b);
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return left - right;
}

function hostKey(host: string): number {
  if (prefixOf(host) === null) return Number.NaN;
  return host.split('.').reduce((key, octet) => key * 256 + Number(octet), 0);
}

/**
 * The addressable hosts of a `/24`, minus this machine's own. A television
 * answers on a home network, and a network wider than a `/24` is a sweep long
 * enough that nobody waits for it.
 */
export function subnetHosts(prefix: string, self?: string): string[] {
  const hosts: string[] = [];
  for (let last = 1; last <= 254; last++) {
    const host = `${prefix}.${last}`;
    if (host !== self) hosts.push(host);
  }
  return hosts;
}
