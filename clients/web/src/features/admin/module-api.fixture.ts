import { createKromaClient } from '@kromatv/client';
import { createAdminApi } from './module-api';
export const client = createKromaClient({
  baseUrl: 'http://kroma.test',
  fetch: (...args) => globalThis.fetch(...args),
});
export const moduleApi = createAdminApi(client);
export const setSessionToken = client.setAuthToken;
export const sessionToken = () => client.sessionToken;

import { afterEach, beforeEach, vi } from 'vitest';

export const calls: Array<{ url: string; init: RequestInit }> = [];

/** Registers the per-test reset the module-api suites share. */
export function installHarness(): void {
  beforeEach(() => {
    calls.length = 0;
    setSessionToken(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionToken(undefined);
  });
}

export function stubFetch(res: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(res);
    }),
  );
}

// Throws when there is no call, rather than returning nothing: otherwise a test
// asserting an absent header would pass for the wrong reason (no request was made).
export const headersOf = (init: RequestInit | undefined): Record<string, string> => {
  if (!init) throw new Error('expected a recorded fetch call, but none was made');
  return init.headers as Record<string, string>;
};

export const unreadable = (status: number) =>
  ({
    ok: false,
    status,
    text: () => Promise.reject(new Error('stream closed')),
  }) as unknown as Response;
