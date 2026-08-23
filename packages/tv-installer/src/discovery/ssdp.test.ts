import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSsdpReply, ssdpSearch } from './ssdp';

const socket = vi.hoisted(() => {
  const listeners = new Map<string, (...args: never[]) => void>();
  return {
    listeners,
    on: vi.fn((event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener);
    }),
    bind: vi.fn((ready: () => void) => ready()),
    send: vi.fn((_probe: Buffer, _port: number, _group: string) => undefined),
    close: vi.fn(),
  };
});

vi.mock('node:dgram', () => ({ createSocket: vi.fn(() => socket) }));

const reply = (...headers: string[]) => ['HTTP/1.1 200 OK', ...headers, '', ''].join('\r\n');

const webosReply = reply(
  'CACHE-CONTROL: max-age=1800',
  'DATE: Sat, 22 Aug 2026 09:12:44 GMT',
  'EXT:',
  'Location: http://192.168.1.32:1754/',
  'SERVER: WebOS/1.4 UPnP/1.0 Linux/4.19',
  'st: urn:lge-com:service:webos-second-screen:1',
  'USN: uuid:8e3cf1a4-7c2f-4b19-9a3d-6f0b1f5f5c11::urn:lge-com:service:webos-second-screen:1',
);

describe('parseSsdpReply', () => {
  it('reads the description URL, the server and the target out of a webOS reply', () => {
    expect(parseSsdpReply(webosReply, '192.168.1.32')).toEqual({
      host: '192.168.1.32',
      location: 'http://192.168.1.32:1754/',
      server: 'WebOS/1.4 UPnP/1.0 Linux/4.19',
      searchTarget: 'urn:lge-com:service:webos-second-screen:1',
    });
  });

  it('answers nothing for a reply that points at no description', () => {
    const noLocation = reply(
      'CACHE-CONTROL: max-age=1800',
      'EXT:',
      'ST: upnp:rootdevice',
      'USN: uuid:8e3cf1a4-7c2f-4b19-9a3d-6f0b1f5f5c11::upnp:rootdevice',
    );

    expect(parseSsdpReply(noLocation, '192.168.1.32')).toBeNull();
  });
});

const deliver = (message: string, host: string) => {
  const listener = socket.listeners.get('message') as
    | ((buffer: Buffer, from: { address: string }) => void)
    | undefined;
  listener?.(Buffer.from(message), { address: host });
};

const targetOf = (probe: Buffer) => /\r\nST: (.+)\r\n/.exec(probe.toString('utf8'))?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  socket.listeners.clear();
});

describe('ssdpSearch', () => {
  it('asks the targets it always asks, and the extra ones it was given', async () => {
    await ssdpSearch(10, undefined, ['urn:lge-com:service:webos-second-screen:1']);

    expect(socket.send.mock.calls.map(([probe]) => targetOf(probe))).toEqual([
      'urn:dial-multiscreen-org:service:dial:1',
      'upnp:rootdevice',
      'urn:lge-com:service:webos-second-screen:1',
    ]);
  });

  it('keeps one reply per host and description, however often it heard it', async () => {
    const searching = ssdpSearch(10);

    deliver(webosReply, '192.168.1.32');
    deliver(webosReply, '192.168.1.32');
    deliver(reply('LOCATION: http://192.168.1.44:1754/'), '192.168.1.44');

    expect((await searching).map((answer) => answer.host)).toEqual([
      '192.168.1.32',
      '192.168.1.44',
    ]);
  });

  it('drops a reply that points at no description', async () => {
    const searching = ssdpSearch(10);

    deliver(reply('ST: upnp:rootdevice'), '192.168.1.44');

    expect(await searching).toEqual([]);
  });

  it('stops listening as soon as the signal aborts', async () => {
    const controller = new AbortController();

    const searching = ssdpSearch(60_000, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    expect(await searching).toEqual([]);
    expect(socket.close).toHaveBeenCalled();
  });

  it('closes the socket once, whether the error or the window gets there first', async () => {
    const searching = ssdpSearch(10);

    socket.listeners.get('error')?.();

    expect(await searching).toEqual([]);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
