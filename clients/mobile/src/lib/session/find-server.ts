import { normalizeServerUrl } from '@kromatv/client/accounts';
import type { QueryClient } from '@kromatv/client/query';

const PROBE_TIMEOUT_MS = 5000;

/** The KROMA server behind what a person typed. A bare host
 * ("kroma.example.com") tries https first, then http, so nobody has to type
 * the scheme, and each probe checks that a KROMA server really answers there.
 * Rejects with the last probe's error when none does. */
export async function findServer(
  typed: string,
  makeClient: (url: string) => QueryClient,
): Promise<{ url: string; name?: string }> {
  const raw = typed.trim();
  const candidates = /^https?:\/\//i.test(raw) ? [raw] : [`https://${raw}`, `http://${raw}`];
  let lastError: unknown;
  for (const candidate of candidates) {
    const url = normalizeServerUrl(candidate);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
    try {
      const health = await makeClient(url).media.health({ signal: abort.signal });
      return { url, name: health.name };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('unreachable');
}
