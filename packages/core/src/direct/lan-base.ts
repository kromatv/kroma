const IPV4_ROUTE = /^http:\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/;
const HOST = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]*\]|[^/:?#]*)/i;

function isPrivateV4(octets: readonly number[]): boolean {
  const [a = -1, b = -1] = octets;
  if (octets.some((octet) => octet > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Whether `route` is a plain `http://<private IPv4>:<port>`, the only shape a
 * direct route takes. Anything else in an offer is ignored. */
export function isLanRoute(route: string): boolean {
  const match = IPV4_ROUTE.exec(route);
  if (!match) return false;
  const numbers = match.slice(1).map(Number);
  const port = numbers.pop() ?? 0;
  return port > 0 && port < 65536 && isPrivateV4(numbers);
}

/** Whether `base` already reaches the server on its own network: a private
 * IPv4, loopback, `localhost` or a `.local` name. Such a client has nothing to
 * gain from a direct route. */
export function isLanBase(base: string): boolean {
  const host = HOST.exec(base)?.[1]?.toLowerCase() ?? '';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  return octets[0] === 127 || isPrivateV4(octets);
}
