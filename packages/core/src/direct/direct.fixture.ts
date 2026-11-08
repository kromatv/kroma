import { recordingClient } from '@kromatv/client/test';
import type { DirectOffer } from '@kromatv/client/server';
import { vi } from 'vitest';

export const CANONICAL = 'https://kroma.example';
export const LAN = 'http://192.168.1.2:4040';

export const OFFER: DirectOffer = {
  instanceId: 'srv-1',
  routes: [LAN],
  nonce: 'n1',
  answer: 'a1',
  sameNetwork: true,
};

/** What one host on the network answers: its health, and its proofs by nonce. */
export interface Host {
  instanceId?: string;
  proofs?: Record<string, string>;
  hangs?: boolean;
}

function answerOf(host: Host, url: string): object | undefined {
  if (url.includes('/api/health')) return { status: 'ok', instanceId: host.instanceId };
  const nonce = decodeURIComponent(/[?&]nonce=([^&]*)/.exec(url)?.[1] ?? '');
  const answer = host.proofs?.[nonce];
  return answer === undefined ? undefined : { answer };
}

/** A fetch standing in for the network a probe crosses: a URL on no listed host
 * is refused, as a closed port is. */
export function network(hosts: Record<string, Host>) {
  const seen: { url: string; headers: Headers }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: new Headers(init?.headers) });
    const base = Object.keys(hosts).find((host) => url.startsWith(`${host}/`));
    const host = base ? hosts[base] : undefined;
    if (!host) throw new TypeError('Failed to fetch');
    if (host.hangs) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    const body = answerOf(host, url);
    const text = body ? JSON.stringify(body) : '';
    return {
      ok: body !== undefined,
      status: body ? 200 : 404,
      url,
      json: async () => JSON.parse(text),
      text: async () => text,
    } as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}

/** A client on `CANONICAL` whose server answers `/server/direct` with each of
 * `offers` in turn, the last one for good, and fails it once they run out when
 * `offers` is empty. */
export function clientOffering(...offers: DirectOffer[]) {
  let asked = 0;
  return recordingClient(
    (url) => {
      if (!url.endsWith('/api/server/direct')) return { status: 404, ok: false };
      const offer = offers[Math.min(asked++, offers.length - 1)];
      return offer ? { json: offer } : { status: 503, ok: false };
    },
    { baseUrl: CANONICAL, authToken: 'tok' },
  );
}
