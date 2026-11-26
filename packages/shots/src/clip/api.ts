import type { z } from 'zod';

const TIMEOUT_MS = 15_000;
const SCHEMES = new Set(['http:', 'https:']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** One call to a KROMA server on this machine. Throws on any other host, and
 *  on any status but 2xx, naming the route and the status. */
export async function sendApi(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  if (!SCHEMES.has(target.protocol) || !LOOPBACK.has(target.hostname)) {
    throw new Error(`${url} is not a KROMA server on this machine`);
  }
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const response = await fetch(target, {
    ...init,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url} answered ${response.status}`);
  }
  return response;
}

/** One call to a KROMA server, its answer parsed by `schema`. */
export async function callApi<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await sendApi(url, init);
  return schema.parse(await response.json());
}
