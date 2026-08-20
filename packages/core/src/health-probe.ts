// Reaching `/api/health` on a candidate origin: the schema the answer is held
// to, and the bounded races the discovery entry points run over a host list.

import { Health } from '@kroma/client';
import { z } from 'zod';

// Any host on the link can answer a probe, so what comes back is validated
// before it is believed. Every field but `status` is optional: a server older
// than a field still is one, and discovery reads only what it shows in a picker.
export const HealthProbe = Health.partial().extend({ status: z.string() });
export type HealthProbe = z.infer<typeof HealthProbe>;

// The final URL decides, not the requested one: fetch follows an http-to-https
// redirect, which would otherwise file a TLS server under `http://`.
export async function probeFinalOrigin(
  fetchFn: typeof globalThis.fetch,
  base: string,
  timeoutMs: number,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = HealthProbe.safeParse(await res.json());
    if (!body.success || body.data.status !== 'ok') return null;
    // `res.url` is empty on the odd fetch implementation that omits it.
    return originOf(res.url) ?? base;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return stripTrailingSlash(new URL(url).origin);
  } catch {
    return null;
  }
}

export function raceForServer(
  urls: string[],
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  concurrency = urls.length,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (urls.length === 0) return resolve(null);
    let next = 0;
    let active = 0;
    let done = 0;
    let settled = false;
    const total = urls.length;

    const pump = () => {
      while (active < concurrency && next < total && !settled) {
        const url = urls[next++];
        if (url === undefined) break;
        active += 1;
        void probe(fetchFn, url, timeoutMs).then((ok) => {
          active -= 1;
          done += 1;
          if (ok && !settled) {
            settled = true;
            resolve(url);
          } else if (done === total && !settled) {
            resolve(null);
          } else {
            pump();
          }
        });
      }
    };
    pump();
  });
}

export async function probeAll(
  urls: string[],
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  concurrency: number,
): Promise<Array<{ url: string; body: HealthProbe }>> {
  // Results go into the slot they were claimed from, so probe order holds
  // without a sort and without the urls having to be unique.
  const slots: Array<{ url: string; body: HealthProbe } | null> = urls.map(() => null);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const url = urls[i];
      if (url === undefined) break;
      const body = await probeHealth(fetchFn, url, timeoutMs);
      if (body) slots[i] = { url, body };
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, worker),
  );
  return slots.filter((hit): hit is { url: string; body: HealthProbe } => hit !== null);
}

async function probeHealth(
  fetchFn: typeof globalThis.fetch,
  base: string,
  timeoutMs: number,
): Promise<HealthProbe | null> {
  const ctrl = new AbortController();
  // Cleared in `finally`, or a /24 sweep leaves 253 timers armed on the throw
  // path (abort, DNS failure, connection refused).
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = HealthProbe.safeParse(await res.json());
    return body.success && body.data.status === 'ok' ? body.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function probe(
  fetchFn: typeof globalThis.fetch,
  base: string,
  timeoutMs: number,
): Promise<boolean> {
  return (await probeHealth(fetchFn, base, timeoutMs)) !== null;
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/(^|[^/])\/+$/, '$1');
}
