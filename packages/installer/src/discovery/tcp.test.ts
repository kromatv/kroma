import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect, tcpOpen } from './tcp';

const silent = vi.hoisted(() => ({
  host: 'nothing-answers.invalid',
  socket: () => {
    const handlers = new Map<string, () => void>();
    return {
      setTimeout: (ms: number) => setTimeout(() => handlers.get('timeout')?.(), ms),
      once: (event: string, handler: () => void) => handlers.set(event, handler),
      destroy: () => undefined,
    };
  },
}));

vi.mock('node:net', async (importOriginal) => {
  const net = await importOriginal<typeof import('node:net')>();
  return {
    ...net,
    createConnection: (options: { host: string; port: number }) =>
      options.host === silent.host ? silent.socket() : net.createConnection(options),
  };
});

const servers: Server[] = [];

const portOf = (server: Server): number => {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the server took no port');
  return address.port;
};

const listeningPort = async (): Promise<number> => {
  const server = createServer((socket) => socket.end());
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return portOf(server);
};

const closedPort = async (): Promise<number> => {
  const port = await listeningPort();
  await new Promise<void>((resolve) => servers.pop()?.close(() => resolve()));
  return port;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe('connect', () => {
  it('answers open when something accepts the connection', async () => {
    const port = await listeningPort();

    expect(await connect('127.0.0.1', port, 250)).toMatchObject({ outcome: 'open' });
  });

  it('answers refused when nothing listens on that port', async () => {
    const port = await closedPort();

    expect(await connect('127.0.0.1', port, 250)).toMatchObject({ outcome: 'refused' });
  });

  it('answers timeout when the host never answers the handshake', async () => {
    expect(await connect(silent.host, 8001, 50)).toMatchObject({ outcome: 'timeout' });
  });

  it('answers how long the attempt took', async () => {
    const port = await listeningPort();

    const { ms } = await connect('127.0.0.1', port, 250);

    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(250);
  });
});

describe('tcpOpen', () => {
  it('is true for a port something answers on', async () => {
    const port = await listeningPort();

    expect(await tcpOpen('127.0.0.1', port, 250)).toBe(true);
  });

  it('is false for a port nothing answers on', async () => {
    const port = await closedPort();

    expect(await tcpOpen('127.0.0.1', port, 250)).toBe(false);
  });
});
