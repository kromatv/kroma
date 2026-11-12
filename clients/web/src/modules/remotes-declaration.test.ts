import { createKromaClient } from '@kromatv/client';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModuleRuntime } from './registry';
import { modulesQuery, prefetchModules, readDeclaration } from './remotes';

const URL = 'http://localhost:3000/modules/vpn/shared.json';

const answer = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readDeclaration', () => {
  it('reads what the entry declared it takes from the host', async () => {
    vi.stubGlobal('fetch', answer('{"react":["lazy"],"@kromatv/module-sdk":["defineModule"]}'));

    const reads = await readDeclaration(URL);

    expect(reads).toEqual({ react: ['lazy'], '@kromatv/module-sdk': ['defineModule'] });
    expect(fetch).toHaveBeenCalledWith(URL);
  });

  it.each([
    ['a bundle built before the declaration existed', answer('not found', 404)],
    ['a body that is not JSON', answer('<html>')],
    ['a body of the wrong shape', answer('{"react":"lazy"}')],
    ['a body larger than any declaration', answer(`{"react":["${'x'.repeat(70_000)}"]}`)],
  ])('declares nothing for %s', async (_case, fetched) => {
    vi.stubGlobal('fetch', fetched);

    expect(await readDeclaration(URL)).toBeNull();
  });

  it('declares nothing when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );

    expect(await readDeclaration(URL)).toBeNull();
  });
});

describe('the module list', () => {
  it('is one cache entry that reads GET /api/modules with the session bearer', async () => {
    const fetched = answer('[{"id":"tv.kroma.vpn","name":"VPN"}]');
    const client = createKromaClient({ baseUrl: 'http://localhost:3000', fetch: fetched });
    client.setAuthToken('tok123');

    const query = modulesQuery(client);
    const listed = await query.queryFn?.({} as never);

    expect(query.queryKey).toEqual(['modules']);
    expect(query.staleTime).toBeGreaterThan(0);
    expect(listed).toEqual([{ id: 'tv.kroma.vpn', name: 'VPN' }]);
    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/modules');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok123');
  });

  it('is what a runtime reads its installed set from', async () => {
    const listModules = vi.fn(async () => []);

    const runtime = createModuleRuntime(listModules);

    expect(await runtime.listModules()).toEqual([]);
    expect(listModules).toHaveBeenCalledOnce();
  });
});

describe('reading the module list ahead of the host', () => {
  it('fills the cache entry the host reads once there is a session', async () => {
    const fetched = answer('[{"id":"tv.kroma.vpn","name":"VPN"}]');
    const client = createKromaClient({ baseUrl: 'http://localhost:3000', fetch: fetched });
    client.setAuthToken('tok123');
    const queryClient = new QueryClient();

    await prefetchModules(queryClient, client);

    expect(queryClient.getQueryData(['modules'])).toEqual([{ id: 'tv.kroma.vpn', name: 'VPN' }]);
  });

  it('asks nothing before there is a session', async () => {
    const fetched = answer('[]');
    const client = createKromaClient({ baseUrl: 'http://localhost:3000', fetch: fetched });

    await prefetchModules(new QueryClient(), client);

    expect(fetched).not.toHaveBeenCalled();
  });
});
