import { createConnection } from 'node:net';

export type ConnectOutcome = 'open' | 'refused' | 'timeout';

export interface ConnectResult {
  outcome: ConnectOutcome;
  ms: number;
}

export function connect(host: string, port: number, timeoutMs: number): Promise<ConnectResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const settle = (outcome: ConnectOutcome) => {
      socket.destroy();
      resolve({ outcome, ms: performance.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle('open'));
    socket.once('timeout', () => settle('timeout'));
    socket.once('error', () => settle('refused'));
  });
}

/** True when something accepts a TCP connection there within `timeoutMs`. */
export async function tcpOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return (await connect(host, port, timeoutMs)).outcome === 'open';
}
