import { vi } from 'vitest';
import { KromaClient } from './api';

function urlOf(target: RequestInfo | URL): string {
  if (typeof target === 'string') return target;
  return target instanceof URL ? target.href : target.url;
}

// A recording fetch: captures every request (url + method + body + headers) and
// returns a configurable response. The default response is a 200 with `{}` so a
// delegating method's request is issued (and recorded) even when its response
// validation later rejects the promise - we only assert the request was made.
export interface Recorded {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}
export function recordingFetch(
  responder?: (
    url: string,
    init?: RequestInit,
  ) => Partial<{
    ok: boolean;
    status: number;
    json: unknown;
    blob: Blob;
    text: string;
  }>,
): { fetch: typeof globalThis.fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch = vi.fn(async (target: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(target);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body,
      headers: new Headers(init?.headers),
    });
    const r = responder?.(url, init) ?? {};
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json ?? {},
      blob: async () => r.blob ?? new Blob(),
      // Mirror a real Response: the text body is the serialized JSON unless a
      // responder sets `text` explicitly (e.g. to model an empty 2xx body).
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    } as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

export function makeClient(
  responder?: Parameters<typeof recordingFetch>[0],
  opts?: { authToken?: string; locale?: string },
) {
  const { fetch, calls } = recordingFetch(responder);
  const client = new KromaClient({
    baseUrl: 'http://kroma.test',
    fetch,
    authToken: opts?.authToken,
    locale: opts?.locale,
  });
  return { client, calls };
}
