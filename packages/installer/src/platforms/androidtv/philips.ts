import { fetchJson } from '../../discovery/http';
import { PhilipsSystem } from './schemas';

/**
 * Philips answers JointSpace on 1925 in the clear and, from the 2016 sets, only
 * on 1926 over TLS with a certificate signed by nobody. The API version is part
 * of the path and a set answers exactly one of them.
 */
export async function philipsSystem(
  host: string,
  openPorts: ReadonlySet<number>,
  ports: { plain: number; tls: number },
): Promise<PhilipsSystem | null> {
  const endpoints: string[] = [];
  if (openPorts.has(ports.plain)) {
    endpoints.push(
      `http://${host}:${ports.plain}/6/system`,
      `http://${host}:${ports.plain}/1/system`,
    );
  }
  if (openPorts.has(ports.tls)) endpoints.push(`https://${host}:${ports.tls}/6/system`);

  for (const endpoint of endpoints) {
    const system = await fetchJson(endpoint, PhilipsSystem, {
      insecureTls: endpoint.startsWith('https:'),
    });
    if (system?.name || system?.model) return system;
  }
  return null;
}

/** A Philips only takes an .apk when its OS is Android; Saphi and Titan take nothing. */
export function isAndroid(system: PhilipsSystem): boolean {
  return (system.os_type ?? '').toUpperCase().includes('ANDROID');
}
