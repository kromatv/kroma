import { sessionToken, setSessionToken } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  calls,
  headersOf,
  installHarness,
  stubFetch,
  unreadable,
} from '#web/features/admin/module-api.fixture';
import { adminApi, matchesQuery, message } from './module-api';

installHarness();

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

    calls.length = 0;
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

  it('still reports the status when the error body cannot be read', async () => {
    stubFetch(unreadable(502));
    await expect(adminApi('/modules')).rejects.toThrow('GET /modules -> 502');
  });
});

describe('message', () => {
  it('takes an Error at its word and stringifies anything else', () => {
    expect(message(new Error('checksum mismatch'))).toBe('checksum mismatch');
    expect(message('plain string')).toBe('plain string');
    expect(message(404)).toBe('404');
    expect(message(null)).toBe('null');
  });
});

describe('matchesQuery', () => {
  const mod = { id: 'tv.kroma.torrents', name: 'Torrents', description: 'Download engine' };

  it('matches an empty or whitespace query', () => {
    expect(matchesQuery(mod, '')).toBe(true);
    expect(matchesQuery(mod, '   ')).toBe(true);
  });

  it('matches on id, name and description, case-insensitively', () => {
    expect(matchesQuery(mod, 'KROMA.TOR')).toBe(true);
    expect(matchesQuery(mod, 'torrents')).toBe(true);
    expect(matchesQuery(mod, 'download')).toBe(true);
    expect(matchesQuery(mod, 'vpn')).toBe(false);
  });

  it('treats a missing description as empty rather than matching everything', () => {
    expect(matchesQuery({ id: 'a', name: 'A', description: null }, 'engine')).toBe(false);
    expect(matchesQuery({ id: 'a', name: 'A' }, 'a')).toBe(true);
  });
});
