import type { z } from 'zod';

const TIMEOUT_MS = 15_000;

/** One call to a KROMA server. Throws on any status but 2xx, naming the route
 *  and the status. */
export async function sendApi(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
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
