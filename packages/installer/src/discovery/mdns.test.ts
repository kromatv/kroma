import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DNS_TYPE, encodeQuery } from './dns';
import { localSubnets } from './lan';
import { mdnsBrowse, mdnsPort } from './mdns';

type Listener = (message: Buffer, from: { address: string }) => void;

interface FakeSocket {
  port: number;
  listeners: Listener[];
  sent: { query: Buffer; port: number; to: string }[];
  closed: boolean;
}

const network = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  taken: [] as number[],
  refuseGroup: false,
}));

vi.mock('node:dgram', () => ({
  createSocket: vi.fn(() => {
    const fake: FakeSocket = { port: 0, listeners: [], sent: [], closed: false };
    const errors: ((error: Error) => void)[] = [];
    const socket = {
      once: (_event: string, listener: (error: Error) => void) => errors.push(listener),
      on: (event: string, listener: Listener) => {
        if (event === 'message') fake.listeners.push(listener);
      },
      removeAllListeners: () => undefined,
      bind: (port: number, _address: string | undefined, ready: () => void) => {
        fake.port = port;
        if (network.taken.includes(port)) {
          for (const fail of errors) fail(new Error('EADDRINUSE'));
          return;
        }
        network.sockets.push(fake);
        ready();
      },
      setMulticastInterface: () => undefined,
      addMembership: () => {
        if (network.refuseGroup) throw new Error('EADDRNOTAVAIL');
      },
      send: (query: Buffer, port: number, to: string) => fake.sent.push({ query, port, to }),
      close: () => {
        fake.closed = true;
      },
    };
    return socket;
  }),
}));

vi.mock('./lan', async (original) => ({
  ...(await original<typeof import('./lan')>()),
  localSubnets: vi.fn(),
}));

const CONNECT = '_adb-tls-connect._tcp';
const INSTANCE = `adb-2808-cT0TLZ.${CONNECT}.local`;

const name = (text: string) =>
  Buffer.concat([
    ...text.split('.').flatMap((label) => [Buffer.from([label.length]), Buffer.from(label)]),
    Buffer.from([0]),
  ]);

const record = (owner: string, type: number, data: Buffer) => {
  const fixed = Buffer.alloc(10);
  fixed.writeUInt16BE(type, 0);
  fixed.writeUInt16BE(data.length, 8);
  return Buffer.concat([name(owner), fixed, data]);
};

const response = (...records: Buffer[]) => {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(records.length, 6);
  return Buffer.concat([header, ...records]);
};

const pointer = (instance = INSTANCE) => record(`${CONNECT}.local`, DNS_TYPE.ptr, name(instance));

const service = (port: number, instance = INSTANCE) => {
  const fixed = Buffer.alloc(6);
  fixed.writeUInt16BE(port, 4);
  return record(instance, DNS_TYPE.srv, Buffer.concat([fixed, name('Android.local')]));
};

const asker = () => network.sockets.find((socket) => socket.port === 0);
const shared = () => network.sockets.find((socket) => socket.port === 5353);

async function during<T>(browsing: Promise<T>, act: () => void): Promise<T> {
  await vi.waitFor(() => expect(asker()?.sent.length).toBeGreaterThan(0), { interval: 2 });
  act();
  return browsing;
}

beforeEach(() => {
  network.sockets.length = 0;
  network.taken.length = 0;
  network.refuseGroup = false;
  vi.mocked(localSubnets).mockReturnValue([
    { iface: 'en0', address: '192.168.1.99', prefix: '192.168.1' },
  ]);
});

describe('mdnsBrowse', () => {
  it('asks the whole network for each service type, wanting the answer for itself', async () => {
    await mdnsBrowse([CONNECT, '_googlecast._tcp'], { durationMs: 10 });

    expect(asker()?.sent.map(({ query, port, to }) => [query, port, to])).toEqual([
      [encodeQuery([{ name: `${CONNECT}.local`, type: DNS_TYPE.ptr }], true), 5353, '224.0.0.251'],
      [
        encodeQuery([{ name: '_googlecast._tcp.local', type: DNS_TYPE.ptr }], true),
        5353,
        '224.0.0.251',
      ],
    ]);
  });

  it('asks the hosts it was given directly as well', async () => {
    await mdnsBrowse([CONNECT], { durationMs: 10, hosts: ['192.168.1.78'] });

    expect(asker()?.sent.map(({ to }) => to)).toEqual(['224.0.0.251', '192.168.1.78']);
  });

  it('answers a service with the address that announced it and the port it named', async () => {
    const found = await during(mdnsBrowse([CONNECT], { durationMs: 150 }), () => {
      for (const hear of asker()?.listeners ?? []) {
        hear(response(pointer(), service(35221)), { address: '192.168.1.78' });
      }
    });

    expect(found).toEqual([
      { host: '192.168.1.78', type: CONNECT, instance: 'adb-2808-cT0TLZ', port: 35221 },
    ]);
  });

  it('hears an answer sent to the whole network rather than to itself', async () => {
    const found = await during(mdnsBrowse([CONNECT], { durationMs: 150 }), () => {
      for (const hear of shared()?.listeners ?? []) {
        hear(response(pointer(), service(35221)), { address: '192.168.1.78' });
      }
    });

    expect(found).toHaveLength(1);
  });

  it('asks the announcer for the port of an instance that came without one', async () => {
    const found = await during(mdnsBrowse([CONNECT], { durationMs: 150 }), () => {
      const hear = asker()?.listeners[0];
      hear?.(response(pointer()), { address: '192.168.1.78' });
      hear?.(response(service(35221)), { address: '192.168.1.78' });
    });

    expect(asker()?.sent.at(-1)).toEqual({
      query: encodeQuery([{ name: INSTANCE, type: DNS_TYPE.srv }], true),
      port: 5353,
      to: '192.168.1.78',
    });
    expect(found.map((one) => one.port)).toEqual([35221]);
  });

  it('reports a service once, and again only when its port changed', async () => {
    const reported: number[] = [];
    const browsing = mdnsBrowse([CONNECT], {
      durationMs: 150,
      onService: (one) => reported.push(one.port),
    });

    await during(browsing, () => {
      const hear = asker()?.listeners[0];
      hear?.(response(pointer(), service(35221)), { address: '192.168.1.78' });
      hear?.(response(pointer(), service(35221)), { address: '192.168.1.78' });
      hear?.(response(pointer(), service(41007)), { address: '192.168.1.78' });
    });

    expect(reported).toEqual([35221, 41007]);
  });

  it('leaves out a service of a type it did not ask about', async () => {
    const found = await during(mdnsBrowse([CONNECT], { durationMs: 150 }), () => {
      const airplay = 'Salon._airplay._tcp.local';
      const other = record('_airplay._tcp.local', DNS_TYPE.ptr, name(airplay));
      asker()?.listeners[0]?.(response(other, service(7000, airplay)), { address: '192.168.1.5' });
    });

    expect(found).toEqual([]);
  });

  it('asks again while the window is open, then closes every socket', async () => {
    await mdnsBrowse([CONNECT], { durationMs: 1100 });

    expect(asker()?.sent).toHaveLength(2);
    expect(network.sockets.every((socket) => socket.closed)).toBe(true);
  });

  it('still asks when the port every responder shares cannot be had', async () => {
    network.taken.push(5353);

    await mdnsBrowse([CONNECT], { durationMs: 10 });

    expect(shared()).toBeUndefined();
    expect(asker()?.sent).toHaveLength(1);
  });

  it('does without the shared port on a network it cannot join the group of', async () => {
    network.refuseGroup = true;

    await mdnsBrowse([CONNECT], { durationMs: 10 });

    expect(shared()?.closed).toBe(true);
    expect(asker()?.sent).toHaveLength(1);
  });

  it('asks on the default route of a computer that names no network', async () => {
    vi.mocked(localSubnets).mockReturnValue([]);

    await mdnsBrowse([CONNECT], { durationMs: 10 });

    expect(asker()?.sent).toHaveLength(1);
  });

  it('asks a host directly from the network it sits on alone', async () => {
    vi.mocked(localSubnets).mockReturnValue([
      { iface: 'en0', address: '192.168.1.99', prefix: '192.168.1' },
      { iface: 'en5', address: '10.0.0.4', prefix: '10.0.0' },
    ]);

    await mdnsBrowse([CONNECT], {
      durationMs: 10,
      hosts: ['192.168.1.78', '10.0.0.9', '172.16.0.3'],
    });
    const [wifi, wired] = network.sockets.filter((socket) => socket.port === 0);

    expect(wifi?.sent.map(({ to }) => to)).toEqual(['224.0.0.251', '192.168.1.78', '172.16.0.3']);
    expect(wired?.sent.map(({ to }) => to)).toEqual(['224.0.0.251', '10.0.0.9', '172.16.0.3']);
  });

  it('asks nothing when there is no type to ask about, or the scan was already stopped', async () => {
    const stopped = new AbortController();
    stopped.abort();

    expect(await mdnsBrowse([], { durationMs: 10 })).toEqual([]);
    expect(await mdnsBrowse([CONNECT], { durationMs: 10, signal: stopped.signal })).toEqual([]);
    expect(network.sockets).toEqual([]);
  });
});

describe('mdnsPort', () => {
  it('answers the port as soon as the address names it, without waiting the window out', async () => {
    const started = performance.now();

    const port = await during(mdnsPort('192.168.1.78', CONNECT, 5000), () => {
      asker()?.listeners[0]?.(response(pointer(), service(35221)), { address: '192.168.1.78' });
    });

    expect(port).toBe(35221);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(asker()?.sent.map(({ to }) => to)).toContain('192.168.1.78');
  });

  it('takes no answer from another address for it', async () => {
    const port = await during(mdnsPort('192.168.1.78', CONNECT, 150), () => {
      asker()?.listeners[0]?.(response(pointer(), service(35221)), { address: '192.168.1.80' });
    });

    expect(port).toBeNull();
  });

  it('stops waiting when the caller gives up', async () => {
    const controller = new AbortController();

    const port = await during(mdnsPort('192.168.1.78', CONNECT, 5000, controller.signal), () =>
      controller.abort(),
    );

    expect(port).toBeNull();
  });
});
