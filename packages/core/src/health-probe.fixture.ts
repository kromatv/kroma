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
  return vi.fn((input: RequestInfo | URL) => {
    const url = urlOf(input);
    const h = map[url];
    if (!h) {
      return Promise.resolve({ ok: false, url, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({
      ok: h.ok ?? true,
      url: h.url ?? url,
      json: () =>
        h.throws
          ? Promise.reject(new Error('bad json'))
          : Promise.resolve({ status: h.status ?? 'ok', ...h.body }),
    } as Response);
  }) as unknown as typeof globalThis.fetch;
}

export const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  })) as typeof globalThis.fetch;
