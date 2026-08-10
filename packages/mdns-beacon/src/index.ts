// The beacon a television raises when it has no DNS-SD API of its own.
//
// Apple TV and Android TV publish `_kroma-tv._tcp` through the platform
// (@kroma/lan-beacon). A webOS or Tizen set runs its UI in a browser, which has
// no such API at all - but both platforms let an app ship a service beside that
// browser, and a service has a UDP socket. That is all multicast DNS is, so the
// beacon is the same on every television and only the thing that HOSTS it
// differs (see docs/tv-pairing.md).
//
// Node's `dgram` and nothing else: a service bundle that has to carry a
// dependency tree is one more thing to package, sign and keep current on a
// platform where updating is slow.

import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import {
  answerPacket,
  asksAbout,
  MDNS_ADDRESS,
  MDNS_PORT,
  readQuestions,
  type ServiceRecord,
} from './wire';

/** How long a resolver may cache the records, in seconds. */
const TTL = 120;
// Re-announced well inside the TTL, so a set that was asleep during a browse is
// still found without anyone asking again.
const REANNOUNCE_MS = 45_000;
// The first announcement is sent three times: multicast is lossy, and the whole
// point is to be heard the moment the television appears.
const ANNOUNCE_BURST = [0, 250, 1000];

export interface BeaconOptions {
  /** What a phone shows: the name the owner gave this television. */
  instance: string;
  /** The service being advertised. Defaults to the one a phone browses for. */
  type?: string;
  /** The port the television answers on; the record needs one even when the
   *  proof in the TXT is what the phone is really after. */
  port?: number;
  /** The text record - `proof` is what makes a beacon worth hearing. */
  txt?: Readonly<Record<string, string>>;
  /** Overrides the host name the records point at. */
  host?: string;
}

export interface Beacon {
  /** Withdraws the service: a goodbye with TTL 0, then the socket closes. */
  stop(): void;
}

/** Every IPv4 address of this machine that is worth publishing. */
export function localAddresses(): string[] {
  const out: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      out.push(entry.address);
    }
  }
  return out;
}

function hostLabel(instance: string): string {
  const slug =
    instance
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'kroma-tv';
  return `${slug}.local`;
}

/**
 * Raise the beacon. Returns as soon as the socket is bound; the announcements
 * carry on until `stop()`.
 */
export function publish(options: Readonly<BeaconOptions>): Beacon {
  const service: ServiceRecord = {
    instance: options.instance,
    type: options.type ?? '_kroma-tv._tcp.local',
    host: options.host ?? hostLabel(options.instance),
    port: options.port ?? 8080,
    txt: options.txt ?? {},
    addresses: localAddresses(),
    ttl: TTL,
  };

  const socket: Socket = createSocket({ type: 'udp4', reuseAddr: true });
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const send = (packet: Buffer, to?: { address: string; port: number }) => {
    if (stopped) return;
    socket.send(packet, to?.port ?? MDNS_PORT, to?.address ?? MDNS_ADDRESS, () => undefined);
  };

  socket.on('message', (message, remote) => {
    const questions = readQuestions(message);
    if (!questions.some((q) => asksAbout(q, service))) return;
    // Answered to the group rather than to the asker: every other phone in the
    // room is looking for the same thing, and one packet serves them all.
    send(answerPacket(service));
    if (remote.port !== MDNS_PORT) send(answerPacket(service), remote);
  });

  // A socket that cannot bind must not take the app down with it: a television
  // whose beacon fails is one a phone finds through the server instead.
  socket.on('error', () => undefined);

  socket.bind(MDNS_PORT, () => {
    try {
      socket.setMulticastTTL(255);
      socket.setMulticastLoopback(true);
      socket.addMembership(MDNS_ADDRESS);
    } catch {
      // Some interfaces refuse the group; the others still carry it.
    }
    for (const delay of ANNOUNCE_BURST) {
      timers.push(setTimeout(() => send(answerPacket(service)), delay));
    }
    timers.push(
      setInterval(() => send(answerPacket(service)), REANNOUNCE_MS) as unknown as ReturnType<
        typeof setTimeout
      >,
    );
  });

  return {
    stop() {
      if (stopped) return;
      // The goodbye goes out BEFORE the flag: a phone that keeps a departed
      // television on screen is worse than one that finds it a moment late.
      send(answerPacket({ ...service, ttl: 0 }));
      stopped = true;
      for (const timer of timers) clearTimeout(timer as ReturnType<typeof setTimeout>);
      setTimeout(() => socket.close(), 50);
    },
  };
}

export type { ServiceRecord } from './wire';
export { MDNS_ADDRESS, MDNS_PORT } from './wire';
