import { sessionToken, setSessionToken } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from './module-api';

let calls: Array<{ url: string; init: RequestInit }>;

beforeEach(() => {
  calls = [];
  setSessionToken(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionToken(undefined);
});

function stubFetch(res: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return res;
    }),
  );
}

/** The headers of a recorded call. Throws when there is no call rather than
 * returning nothing: `headersOf(undefined).Authorization` would be `undefined`
 * too, so a test asserting an ABSENT header would pass for the wrong reason - the
 * request never having been made. */
const headersOf = (init: RequestInit | undefined): Record<string, string> => {
  if (!init) throw new Error('expected a recorded fetch call, but none was made');
  return init.headers as Record<string, string>;
};

describe('adminApi', () => {
  it('GETs /api/admin<path> and parses the JSON body', async () => {
    stubFetch(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await adminApi<{ ok: number }>('/modules');
    expect(out).toEqual({ ok: 1 });
    expect(calls[0]?.url.endsWith('/api/admin/modules')).toBe(true);
  });

  it('adds a Bearer header when a session token is present', async () => {
    setSessionToken('tok123');
    expect(sessionToken()).toBe('tok123');
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules');
    expect(headersOf(calls[0]?.init).Authorization).toBe('Bearer tok123');
  });

  it('omits the Authorization header when signed out', async () => {
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules');
    expect(headersOf(calls[0]?.init).Authorization).toBeUndefined();
  });

  it('sets a JSON Content-Type only when there is a body', async () => {
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules/x/config', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(headersOf(calls[0]?.init)['Content-Type']).toBe('application/json');

    calls = [];
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules');
    expect(headersOf(calls[0]?.init)['Content-Type']).toBeUndefined();
  });

  it('returns undefined for a 204 No Content', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(adminApi('/modules/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws the server message on a non-OK response', async () => {
    stubFetch(new Response('dependency conflict', { status: 409 }));
    await expect(adminApi('/modules/x/install', { method: 'POST' })).rejects.toThrow(
      'dependency conflict',
    );
  });

  it('falls back to a method/path/status message when the body is empty', async () => {
    stubFetch(new Response('', { status: 500 }));
    await expect(adminApi('/modules/x', { method: 'DELETE' })).rejects.toThrow(
      'DELETE /modules/x -> 500',
    );
  });

  it('defaults the fallback verb to GET', async () => {
    stubFetch(new Response('', { status: 500 }));
    await expect(adminApi('/modules')).rejects.toThrow('GET /modules -> 500');
  });
});
