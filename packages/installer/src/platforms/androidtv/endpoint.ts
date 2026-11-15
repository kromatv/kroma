import { mdnsPort } from '../../discovery/mdns';
import { tcpOpen } from '../../discovery/tcp';

export const ADB_PORT = 5555;
export const ADB_CONNECT_SERVICE = '_adb-tls-connect._tcp';
export const ADB_PAIRING_SERVICE = '_adb-tls-pairing._tcp';

const CLASSIC_TIMEOUT_MS = 1000;
const ADVERTISED_TIMEOUT_MS = 6000;

export interface AdbEndpoint {
  port: number;
  wireless: boolean;
}

/**
 * Where a set answers adb right now: port 5555 when Network debugging holds
 * it open, else the port its Wireless debugging advertises, which changes
 * every time that is switched on. Null when it offers neither.
 */
export async function adbEndpoint(host: string): Promise<AdbEndpoint | null> {
  if (await tcpOpen(host, ADB_PORT, CLASSIC_TIMEOUT_MS)) return { port: ADB_PORT, wireless: false };
  const port = await mdnsPort(host, ADB_CONNECT_SERVICE, ADVERTISED_TIMEOUT_MS);
  return port === null ? null : { port, wireless: true };
}
