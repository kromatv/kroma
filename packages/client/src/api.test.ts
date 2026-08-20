import { describe, expect, it, vi } from 'vitest';
import { KromaClient } from './api';
import { makeClient, recordingFetch } from './api.fixture';
import { KromaApiError } from './client/base';
import { ItemId } from './schemas/ids';

describe('KromaClient constructor: baseUrl normalization', () => {
  it('strips trailing slashes while preserving the scheme separator', () => {
    expect(new KromaClient({ baseUrl: 'http://nas:4040/' }).baseUrl).toBe('http://nas:4040');
    expect(new KromaClient({ baseUrl: 'http://nas:4040///' }).baseUrl).toBe('http://nas:4040');
    expect(new KromaClient({ baseUrl: 'http://nas:4040' }).baseUrl).toBe('http://nas:4040');
    expect(new KromaClient({ baseUrl: 'http://nas/lib/' }).baseUrl).toBe('http://nas/lib');
  });
});

describe('auth token, locale and hasAuth', () => {
  it('reports hasAuth only when a token is set', () => {
    expect(new KromaClient({ baseUrl: 'http://x' }).hasAuth).toBe(false);
    const c = new KromaClient({ baseUrl: 'http://x', authToken: 'tok' });
    expect(c.hasAuth).toBe(true);
    c.setAuthToken(undefined);
    expect(c.hasAuth).toBe(false);
    c.setAuthToken('again');
    expect(c.hasAuth).toBe(true);
  });

  it('sends the current bearer + Accept-Language on requests', async () => {
    const { client, calls } = makeClient(undefined, { authToken: 'tok', locale: 'fr' });
    await client.health();
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer tok');
    expect(calls[0]?.headers.get('Accept-Language')).toBe('fr');
  });

  it('setAuthToken / setLocale change what later requests carry', async () => {
    const { client, calls } = makeClient();
    client.setAuthToken('t2');
    client.setLocale('en');
    await client.health();
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer t2');
    expect(calls[0]?.headers.get('Accept-Language')).toBe('en');
  });

  it('omits auth/locale headers when neither is set', async () => {
    const { client, calls } = makeClient();
    await client.health();
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
    expect(calls[0]?.headers.get('Accept-Language')).toBeNull();
  });
});

describe('the bearer for callers that bypass json/blob', () => {
  it('exposes the token for the event socket, which carries it as a subprotocol', () => {
    const c = new KromaClient({ baseUrl: 'http://x' });
    expect(c.sessionToken).toBeUndefined();
    c.setAuthToken('tok');
    expect(c.sessionToken).toBe('tok');
  });

  it('hands out an Authorization header only when there is a token', () => {
    const c = new KromaClient({ baseUrl: 'http://x' });
    expect(c.authHeaders()).toEqual({});
    c.setAuthToken('tok');
    expect(c.authHeaders()).toEqual({ Authorization: 'Bearer tok' });
  });
});

describe('module admin API', () => {
  it("mounts a module's routes under its own encoded id", async () => {
    const { client, calls } = makeClient();
    const api = client.module('tv.kroma.torrents');
    await api.get('/clients');
    await api.post('/clients', { url: 'http://qb' });
    await api.put('/clients/1', { url: 'http://qb' });
    await api.delete('/clients/1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET http://kroma.test/api/admin/m/tv.kroma.torrents/clients',
      'POST http://kroma.test/api/admin/m/tv.kroma.torrents/clients',
      'PUT http://kroma.test/api/admin/m/tv.kroma.torrents/clients/1',
      'DELETE http://kroma.test/api/admin/m/tv.kroma.torrents/clients/1',
    ]);
  });
});

// A native shell's own name (see `clientUserAgent`). The account page lists a
// device by what it sent when it signed in, so this has to ride on requests the
// user never sees - the login itself, and the token exchange after it.
describe('device User-Agent', () => {
  it('rides on every request when the shell set one', async () => {
    const { fetch, calls } = recordingFetch();
    const client = new KromaClient({
      baseUrl: 'http://kroma.test',
      fetch,
      userAgent: 'Kroma/0.1.3 (Apple TV; tvOS 26.0)',
    });
    await client.health();
    await client.login('owner', 'pw').catch(() => undefined);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.get('User-Agent')).toBe('Kroma/0.1.3 (Apple TV; tvOS 26.0)');
    }
  });

  it('sets nothing when the shell did not: a browser owns its own', async () => {
    const { client, calls } = makeClient();
    await client.health();
    expect(calls[0]?.headers.get('User-Agent')).toBeNull();
  });
});

describe('silent refresh on 401 (json)', () => {
  // Fail the first request to a path with 401, then succeed on the retry.
  function refreshingFetch(failPathPart: string) {
    let hits = 0;
    return recordingFetch((url) => {
      if (url.includes(failPathPart)) {
        hits += 1;
        if (hits === 1) return { ok: false, status: 401, json: { error: 'expired' } };
      }
      return { ok: true, status: 200, json: {} };
    });
  }

  it('refreshes once from the handler then retries with the new token', async () => {
    const { fetch, calls } = refreshingFetch('/home');
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);

    await expect(client.home()).resolves.toEqual({});
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    // The retry carries the refreshed bearer.
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer fresh');
  });

  it('propagates the 401 when there is no refresh handler', async () => {
    const { fetch } = refreshingFetch('/home');
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    await expect(client.home()).rejects.toBeInstanceOf(KromaApiError);
  });

  it('propagates the 401 when the handler cannot refresh (undefined)', async () => {
    const { fetch, calls } = refreshingFetch('/home');
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => undefined);
    client.setRefreshHandler(refresh);
    await expect(client.home()).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1); // no retry
  });

  it('does not loop: a second 401 after the retry throws', async () => {
    // Always 401 on /home.
    const { fetch, calls } = recordingFetch(() => ({ ok: false, status: 401, json: {} }));
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);
    await expect(client.home()).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2); // original + one retry, then gives up
  });

  it('never refreshes a NO_REFRESH endpoint (token exchange)', async () => {
    const { fetch, calls } = recordingFetch(() => ({ ok: false, status: 401, json: {} }));
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);
    await expect(client.exchangeToken('access')).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('does not refresh a pre-auth handshake path', async () => {
    // quickconnect/poll is NO_REFRESH: it has no session bearer to refresh, and
    // trying would recurse. (It no longer carries a query string either: the
    // secret moved to a header, because a URL is logged everywhere. The path
    // matcher still strips a query, which no NO_REFRESH path now has.)
    const { fetch, calls } = recordingFetch(() => ({ ok: false, status: 401, json: {} }));
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);
    await expect(client.quickConnectPoll('sec')).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('does refresh a refresh-eligible path that carries a query string', async () => {
    const { fetch, calls } = refreshingFetch('/search');
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);
    await client.search('star wars');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('does not refresh on a non-401 error', async () => {
    const { fetch, calls } = recordingFetch(() => ({ ok: false, status: 500, json: {} }));
    const client = new KromaClient({ baseUrl: 'http://kroma.test', fetch, authToken: 'old' });
    const refresh = vi.fn(async () => 'fresh');
    client.setRefreshHandler(refresh);
    await expect(client.home()).rejects.toMatchObject({ status: 500 });
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });
});

describe('me', () => {
  const USER = {
    id: 'u1',
    email: 'max@kroma.tv',
    username: 'max',
    permissions: ['playback'],
    createdAt: '2026-01-01T00:00:00Z',
    hasPin: false,
  };

  it('validates the account the server returns', async () => {
    const { client } = makeClient(() => ({ json: { user: USER } }));
    await expect(client.me()).resolves.toEqual({ user: USER });
  });

  it('rejects an account the schema does not recognize', async () => {
    const { client } = makeClient(() => ({ json: { user: { ...USER, permissions: 'all' } } }));
    await expect(client.me()).rejects.toThrow();
  });
});

describe('posterBlob', () => {
  it('fetches an absolute (TMDB) poster directly, no /api prefix or auth', async () => {
    const { client, calls } = makeClient(undefined, { authToken: 'tok' });
    const blob = await client.posterBlob({
      id: ItemId.of('i1'),
      metadata: { posterUrl: 'https://image.tmdb.org/p.jpg' } as never,
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(calls[0]?.url).toBe('https://image.tmdb.org/p.jpg');
    // Direct fetch: no bearer attached (the request had no init headers).
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
  });

  it('throws when an absolute poster fetch is not ok', async () => {
    const { client } = makeClient(() => ({ ok: false, status: 404 }), { authToken: 'tok' });
    await expect(
      client.posterBlob({
        id: ItemId.of('i1'),
        metadata: { posterUrl: 'https://img/x.jpg' } as never,
      }),
    ).rejects.toThrow('poster 404');
  });

  it('strips a single /api prefix from a cached-art path and refetches it', async () => {
    const { client, calls } = makeClient();
    await client.posterBlob({
      id: ItemId.of('i1'),
      metadata: { posterUrl: '/api/images/p.webp' } as never,
    });
    expect(calls[0]?.url).toBe('http://kroma.test/api/images/p.webp');
  });

  it('falls back to the generated poster endpoint when no posterUrl (encoding the id)', async () => {
    const { client, calls } = makeClient();
    await client.posterBlob({ id: ItemId.of('a b'), metadata: null });
    expect(calls[0]?.url).toBe('http://kroma.test/api/items/a%20b/poster');
  });
});
