import type { NetworkInterfaceInfo } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sockets, interfaces } = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  interfaces: { value: {} as Record<string, NetworkInterfaceInfo[] | undefined> },
}));

interface Sent {
  packet: Buffer;
  port: number;
  address: string;
}

class FakeSocket {
  readonly sent: Sent[] = [];
  readonly handlers = new Map<string, (...args: unknown[]) => void>();
  readonly memberships: string[] = [];
  bound?: () => void;
  ttl?: number;
  loopback?: boolean;
  closed = false;
  throwOnMulticast = false;

  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }
  bind(_port: number, callback: () => void) {
    this.bound = callback;
  }
  send(packet: Buffer, port: number, address: string, done: () => void) {
    this.sent.push({ packet, port, address });
    done();
  }
  setMulticastTTL(value: number) {
    if (this.throwOnMulticast) throw new Error('EPERM');
    this.ttl = value;
  }
  setMulticastLoopback(value: boolean) {
    this.loopback = value;
  }
  addMembership(address: string) {
    this.memberships.push(address);
  }
  close() {
    this.closed = true;
  }
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
}

vi.mock('node:dgram', () => ({
  createSocket: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

vi.mock('node:os', () => ({
  networkInterfaces: () => interfaces.value,
}));

const { localAddresses, MDNS_ADDRESS, MDNS_PORT, publish } = await import('./index');
const { readQuestions, TYPE } = await import('./wire');

const iface = (over: Partial<NetworkInterfaceInfo>): NetworkInterfaceInfo =>
  ({
    address: '192.168.1.42',
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: '192.168.1.42/24',
    ...over,
  }) as NetworkInterfaceInfo;

function query(name: string, type: number): Buffer {
  const labels = name
    .split('.')
    .flatMap((part) => [Buffer.from([part.length]), Buffer.from(part, 'utf8')]);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(type, 0);
  tail.writeUInt16BE(1, 2);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, ...labels, Buffer.from([0]), tail]);
}

const latest = () => sockets[sockets.length - 1] as FakeSocket;

beforeEach(() => {
  sockets.length = 0;
  interfaces.value = { en0: [iface({})] };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('localAddresses', () => {
  it('publishes only the external IPv4 addresses', () => {
    interfaces.value = {
      lo0: [iface({ address: '127.0.0.1', internal: true })],
      en0: [iface({ address: '192.168.1.42' }), iface({ address: 'fe80::1', family: 'IPv6' })],
      en1: [iface({ address: '10.0.0.5' })],
      down: undefined,
    };
    expect(localAddresses()).toEqual(['192.168.1.42', '10.0.0.5']);
  });
});

describe('publish', () => {
  it('announces the service a phone browses for, on the multicast group', () => {
    publish({ instance: 'Salon', txt: { proof: 'abc' } });
    latest().bound?.();
    vi.advanceTimersByTime(0);

    const [first] = latest().sent;
    expect(first?.address).toBe(MDNS_ADDRESS);
    expect(first?.port).toBe(MDNS_PORT);
    const text = first?.packet.toString('utf8');
    expect(text).toContain('_kroma-tv');
    expect(text).toContain('Salon');
    expect(text).toContain('proof=abc');
    expect(first?.packet.includes(Buffer.from([192, 168, 1, 42]))).toBe(true);
  });

  it('repeats the first announcement, because multicast is lossy', () => {
    publish({ instance: 'Salon' });
    latest().bound?.();
    vi.advanceTimersByTime(1000);
    expect(latest().sent).toHaveLength(3);

    vi.advanceTimersByTime(45_000);
    expect(latest().sent).toHaveLength(4);
  });

  it('joins the group with a TTL that crosses the whole link', () => {
    publish({ instance: 'Salon' });
    latest().bound?.();
    expect(latest().ttl).toBe(255);
    expect(latest().loopback).toBe(true);
    expect(latest().memberships).toEqual([MDNS_ADDRESS]);
  });

  it('keeps announcing on the interfaces that took the group when one refuses', () => {
    publish({ instance: 'Salon' });
    latest().throwOnMulticast = true;
    expect(() => latest().bound?.()).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(latest().sent.length).toBeGreaterThan(0);
  });

  it('derives a host label from the name, and falls back when nothing survives it', () => {
    publish({ instance: 'Salon — TV 4K!' });
    latest().bound?.();
    vi.advanceTimersByTime(0);
    expect(latest().sent[0]?.packet.toString('utf8')).toContain('salon-tv-4k');

    publish({ instance: '!!!' });
    latest().bound?.();
    vi.advanceTimersByTime(0);
    expect(latest().sent[0]?.packet.toString('utf8')).toContain('kroma-tv');
  });

  it('honours an explicit host, type and port', () => {
    publish({ instance: 'Salon', host: 'given.local', type: '_other._tcp.local', port: 9999 });
    latest().bound?.();
    vi.advanceTimersByTime(0);
    const packet = latest().sent[0]?.packet as Buffer;
    expect(packet.toString('utf8')).toContain('given');
    expect(packet.toString('utf8')).toContain('_other');
    expect(packet.includes(Buffer.from([0x27, 0x0f]))).toBe(true);
  });

  it('answers a question about the service, to the group', () => {
    publish({ instance: 'Salon' });
    latest().bound?.();
    vi.advanceTimersByTime(1000);
    latest().sent.length = 0;

    latest().emit('message', query('_kroma-tv._tcp.local', TYPE.PTR), {
      address: '192.168.1.9',
      port: MDNS_PORT,
    });
    expect(latest().sent).toHaveLength(1);
    expect(latest().sent[0]?.address).toBe(MDNS_ADDRESS);
    expect(readQuestions(latest().sent[0]?.packet as Buffer)).toEqual([]);
  });

  it('also answers a unicast asker directly, since it is not listening to the group', () => {
    publish({ instance: 'Salon' });
    latest().bound?.();
    vi.advanceTimersByTime(1000);
    latest().sent.length = 0;

    latest().emit('message', query('_kroma-tv._tcp.local', TYPE.ANY), {
      address: '192.168.1.9',
      port: 54321,
    });
    expect(latest().sent.map((s) => [s.address, s.port])).toEqual([
      [MDNS_ADDRESS, MDNS_PORT],
      ['192.168.1.9', 54321],
    ]);
  });

  it('stays quiet for somebody else’s service', () => {
    publish({ instance: 'Salon' });
    latest().bound?.();
    vi.advanceTimersByTime(1000);
    latest().sent.length = 0;

    latest().emit('message', query('_airplay._tcp.local', TYPE.PTR), {
      address: '192.168.1.9',
      port: MDNS_PORT,
    });
    expect(latest().sent).toEqual([]);
  });

  it('does not take the app down when the socket cannot bind', () => {
    publish({ instance: 'Salon' });
    expect(() => latest().emit('error', new Error('EADDRINUSE'))).not.toThrow();
  });
});

describe('stop', () => {
  it('says goodbye with a zero TTL before it goes quiet', () => {
    const beacon = publish({ instance: 'Salon' });
    latest().bound?.();
    vi.advanceTimersByTime(1000);
    latest().sent.length = 0;

    beacon.stop();
    const goodbye = latest().sent[0]?.packet as Buffer;
    const at = goodbye.indexOf(Buffer.from([0x00, TYPE.PTR]));
    expect(goodbye.readUInt32BE(at + 4)).toBe(0);
  });

  it('closes the socket and stops re-announcing', () => {
    const beacon = publish({ instance: 'Salon' });
    latest().bound?.();
    vi.advanceTimersByTime(1000);
    beacon.stop();
    const after = latest().sent.length;

    vi.advanceTimersByTime(200_000);
    expect(latest().closed).toBe(true);
    expect(latest().sent).toHaveLength(after);
  });

  it('is idempotent: a second stop sends no second goodbye', () => {
    const beacon = publish({ instance: 'Salon' });
    latest().bound?.();
    beacon.stop();
    const after = latest().sent.length;
    beacon.stop();
    expect(latest().sent).toHaveLength(after);
  });

  it('ignores a question that arrives after it has gone', () => {
    const beacon = publish({ instance: 'Salon' });
    latest().bound?.();
    beacon.stop();
    latest().sent.length = 0;

    latest().emit('message', query('_kroma-tv._tcp.local', TYPE.PTR), {
      address: '192.168.1.9',
      port: MDNS_PORT,
    });
    expect(latest().sent).toEqual([]);
  });
});
