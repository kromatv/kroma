import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModuleRuntime } from './registry';
import { modulesQuery, readDeclaration } from './remotes';

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
  it('is one cache entry that reads GET /api/modules', async () => {
    vi.stubGlobal('fetch', answer('[{"id":"tv.kroma.vpn"}]'));

    const query = modulesQuery();
    const listed = await query.queryFn?.({} as never);

    expect(query.queryKey).toEqual(['modules']);
    expect(query.staleTime).toBeGreaterThan(0);
    expect(listed).toEqual([{ id: 'tv.kroma.vpn' }]);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/modules', { headers: {} });
  });

  it('is what a runtime reads when its host gives it no list of its own', async () => {
    vi.stubGlobal('fetch', answer('[{"id":"tv.kroma.remote"}]'));

    const runtime = createModuleRuntime();

    expect(await runtime.listModules()).toEqual([{ id: 'tv.kroma.remote' }]);
  });
});
