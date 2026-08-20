import { vi } from 'vitest';

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

// A fetch stub driven by a URL -> health-body map; a URL absent from the map is
// a dead host.
export type Health = {
  ok?: boolean;
  status?: string;
  throws?: boolean;
  body?: Record<string, unknown>;
  url?: string;
};
export function fakeFetch(map: Record<string, Health>): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input);
    const h = map[url];
    if (!h) return { ok: false, url, json: async () => ({}) } as Response;
    return {
      ok: h.ok ?? true,
      url: h.url ?? url,
      json: async () => {
        if (h.throws) throw new Error('bad json');
        return { status: h.status ?? 'ok', ...h.body };
      },
    } as Response;
  }) as unknown as typeof globalThis.fetch;
}

export const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  })) as typeof globalThis.fetch;
