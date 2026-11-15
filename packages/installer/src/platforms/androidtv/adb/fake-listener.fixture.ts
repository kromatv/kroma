import type { Server, Socket } from 'node:net';

/** Where a fake server listens, and how to take it down with every socket it still holds. */
export interface Listening {
  port: number;
  close: () => Promise<void>;
}

/** Starts `server` on a free loopback port. */
export async function listenOnLoopback(
  server: Server,
  sockets: ReadonlySet<Socket>,
): Promise<Listening> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    port: typeof address === 'object' && address ? address.port : 0,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      }),
  };
}
