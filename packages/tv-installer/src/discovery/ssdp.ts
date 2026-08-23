import { createSocket } from 'node:dgram';

const SSDP_MULTICAST_GROUP = '239.255.255.250';
const SSDP_PORT = 1900;
const MAX_WAIT_SECONDS = 2;

/** What every television answers to, `dial` being the screen-casting service they all publish. */
export const SEARCH_TARGETS = [
  'urn:dial-multiscreen-org:service:dial:1',
  'upnp:rootdevice',
] as const;

export interface SsdpReply {
  host: string;
  location: string;
  server: string;
  searchTarget: string;
}

export function parseSsdpReply(message: string, host: string): SsdpReply | null {
  const headers = new Map<string, string>();
  for (const line of message.split(/\r?\n/).slice(1)) {
    const at = line.indexOf(':');
    if (at < 1) continue;
    headers.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
  }
  const location = headers.get('location');
  if (!location) return null;
  return {
    host,
    location,
    server: headers.get('server') ?? '',
    searchTarget: headers.get('st') ?? '',
  };
}

/** Broadcasts one M-SEARCH per target and collects replies until the window closes. */
export async function ssdpSearch(
  durationMs: number,
  signal?: AbortSignal,
  extraTargets: readonly string[] = [],
): Promise<SsdpReply[]> {
  const replies = new Map<string, SsdpReply>();
  const socket = createSocket({ type: 'udp4', reuseAddr: true });

  socket.on('message', (buffer, from) => {
    const reply = parseSsdpReply(buffer.toString('utf8'), from.address);
    if (reply) replies.set(`${reply.host}|${reply.location}`, reply);
  });
  // Closing twice throws, and a multicast send fails outright when the link is
  // down, so a scan on a sleeping interface must come back empty rather than die.
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    socket.close();
  };
  socket.on('error', close);

  await new Promise<void>((resolve) => socket.bind(resolve));
  for (const target of [...SEARCH_TARGETS, ...extraTargets]) {
    const probe = Buffer.from(
      `M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_MULTICAST_GROUP}:${SSDP_PORT}\r\n` +
        `MAN: "ssdp:discover"\r\nMX: ${MAX_WAIT_SECONDS}\r\nST: ${target}\r\n\r\n`,
    );
    socket.send(probe, SSDP_PORT, SSDP_MULTICAST_GROUP);
  }

  await listenFor(durationMs, signal);
  close();
  return [...replies.values()];
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
