import { describe, expect, it, vi } from 'vitest';
import { ItemId } from './api/media';
import { sessionToken } from './core/session';
import { createKromaClient } from './kroma-client';
import { fakeClient, recordingClient } from './kroma-client.fixture';

describe('baseUrl normalization', () => {
  it('strips trailing slashes while preserving the scheme separator', () => {
    expect(createKromaClient({ baseUrl: 'http://nas:4040/' }).baseUrl).toBe('http://nas:4040');
    expect(createKromaClient({ baseUrl: 'http://nas:4040///' }).baseUrl).toBe('http://nas:4040');
    expect(createKromaClient({ baseUrl: 'http://nas/lib/' }).baseUrl).toBe('http://nas/lib');
  });
});

describe('the bearer', () => {
  it('reports hasAuth only when one is set', () => {
    const client = createKromaClient({ baseUrl: 'http://x' });
    expect(client.hasAuth).toBe(false);
    client.setAuthToken('tok');
    expect(client.hasAuth).toBe(true);
    client.setAuthToken(undefined);
    expect(client.hasAuth).toBe(false);
  });

  it('publishes itself to the shared session, so the event socket needs no second call', () => {
    const client = createKromaClient({ baseUrl: 'http://x' });

    client.setAuthToken('tok');

    expect(sessionToken()).toBe('tok');
    client.setAuthToken(undefined);
    expect(sessionToken()).toBeUndefined();
  });

  it('rides on a request, with the locale, and changes when it is set again', async () => {
    const { client, calls } = recordingClient(() => ({ json: {} }), {
      authToken: 'tok',
      locale: 'fr',
    });

    await client.media.health().catch(() => undefined);
    client.setAuthToken('t2');
    client.setLocale('en');
    await client.media.health().catch(() => undefined);

    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer tok');
    expect(calls[0]?.headers.get('Accept-Language')).toBe('fr');
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer t2');
    expect(calls[1]?.headers.get('Accept-Language')).toBe('en');
  });

  it('hands out an Authorization header only when there is a token', () => {
    const client = createKromaClient({ baseUrl: 'http://x' });
    expect(client.authHeaders()).toEqual({});
    client.setAuthToken('tok');
    expect(client.authHeaders()).toEqual({ Authorization: 'Bearer tok' });
  });

  it('exposes itself for the event socket, which carries it as a subprotocol', () => {
    const client = createKromaClient({ baseUrl: 'http://x' });
    expect(client.sessionToken).toBeUndefined();
    client.setAuthToken('tok');
    expect(client.sessionToken).toBe('tok');
  });
});

describe('the device User-Agent', () => {
  it('rides on every request when the shell set one', async () => {
    const { client, calls } = recordingClient(() => ({ json: {} }), {
      userAgent: 'Kroma/0.1.3 (Apple TV; tvOS 26.0)',
    });

    await client.media.health().catch(() => undefined);
    await client.accounts.login('owner', 'pw').catch(() => undefined);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.get('User-Agent')).toBe('Kroma/0.1.3 (Apple TV; tvOS 26.0)');
    }
  });

  it('sets nothing when the shell did not: a browser owns its own', async () => {
    const { client, calls } = recordingClient(() => ({ json: {} }));

    await client.media.health().catch(() => undefined);

    expect(calls[0]?.headers.get('User-Agent')).toBeNull();
  });
});

describe('refreshing a dead session', () => {
  it('adopts the fresh bearer everywhere, so the socket follows too', async () => {
    const client = createKromaClient({ baseUrl: 'http://x' });
    const refresh = vi.fn(async () => 'fresh');

    client.setRefreshHandler(refresh);
    const token = await client.refreshSession();

    expect(token).toBe('fresh');
    expect(client.sessionToken).toBe('fresh');
    expect(sessionToken()).toBe('fresh');
  });

  it('resolves undefined when nothing can mint one', async () => {
    const client = createKromaClient({ baseUrl: 'http://x' });

    await expect(client.refreshSession()).resolves.toBeUndefined();
  });
});

describe('the recording client', () => {
  it('records the URL whether fetch was handed a string, a URL or a Request', async () => {
    const { fetch, calls } = recordingClient();

    await fetch('http://kroma.test/api/a');
    await fetch(new URL('http://kroma.test/api/b'));
    await fetch(new Request('http://kroma.test/api/c'));

    expect(calls.map((c) => c.path)).toEqual(['/a', '/b', '/c']);
  });
});

describe('fakeClient', () => {
  it('takes a namespace as far as the test needs it, nested members included', async () => {
    const resolve = () => 'http://kroma.test/api/images/p.webp';
    const client = fakeClient({ media: { artwork: { resolve } } });

    expect(client.media.artwork.resolve('/api/images/p.webp')).toBe(
      'http://kroma.test/api/images/p.webp',
    );
  });

  it('carries the controls whole, so a test needs no cast at the call site', async () => {
    const client = fakeClient();

    client.setAuthToken('tok');
    client.setLocale('fr');
    client.setRefreshHandler(async () => 'fresh');

    expect(client.baseUrl).toBe('http://kroma.test');
    expect(client.hasAuth).toBe(false);
    expect(client.sessionToken).toBeUndefined();
    expect(client.authHeaders()).toEqual({});
    await expect(client.refreshSession()).resolves.toBeUndefined();
  });

  it('names the member a test did not provide, rather than failing as undefined', () => {
    const client = fakeClient({ media: { artwork: { resolve: () => null } } });

    expect(() => client.media.artwork.posterUrl(ItemId.parse('i1'))).toThrow(
      'media.artwork.posterUrl',
    );
    expect(() => client.playback.progress()).toThrow('playback.progress');
  });
});
