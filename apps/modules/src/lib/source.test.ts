import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, loadCatalog, UNAVAILABLE } from './source';

const FRESH = 'https://kroma-modules.cache/catalog-fresh';
const STALE = 'https://kroma-modules.cache/catalog-stale';

const BODY = JSON.stringify({ schema: 2, modules: [{ id: 'tv.kroma.vpn' }] });

function edgeCache() {
  const store = new Map<string, Response>();
  vi.stubGlobal('caches', {
    default: {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, res: Response) => {
        store.set(key, res);
      },
    },
  });
  return store;
}

function background() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
    settled: () => Promise.all(pending),
  };
}

function upstream(body: string, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(body, { status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('jsonResponse', () => {
  it('is cacheable by anyone, for as long as it was told', () => {
    const res = jsonResponse(BODY, 300);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('loadCatalog', () => {
  it('answers from the fresh edge copy without reaching GitHub', async () => {
    edgeCache().set(FRESH, jsonResponse(BODY, 300));
    const calls = upstream('never asked for');

    expect(await loadCatalog({}, () => {})).toBe(BODY);
    expect(calls).toEqual([]);
  });

  it('fills both edge copies in the background on a miss', async () => {
    const store = edgeCache();
    upstream(BODY);
    const { waitUntil, settled } = background();

    expect(await loadCatalog({}, waitUntil)).toBe(BODY);
    await settled();

    expect(store.get(FRESH)?.headers.get('cache-control')).toBe('public, max-age=300');
    expect(store.get(STALE)?.headers.get('cache-control')).toBe('public, max-age=604800');
    expect(await store.get(STALE)?.clone().text()).toBe(BODY);
  });

  it('serves the week-old copy when GitHub is down', async () => {
    edgeCache().set(STALE, jsonResponse(BODY, 604800));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    expect(await loadCatalog({}, () => {})).toBe(BODY);
  });

  it('gives up and logs when neither upstream nor the stale copy can answer', async () => {
    edgeCache();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upstream('not found', 404);

    expect(await loadCatalog({}, () => {})).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it('still works with no edge cache at all, as under vite dev', async () => {
    vi.stubGlobal('caches', undefined);
    const calls = upstream(BODY);

    expect(await loadCatalog({ GITHUB_REPO: 'someone/fork' }, () => {})).toBe(BODY);
    expect(calls).toEqual([
      'https://github.com/someone/fork/releases/latest/download/modules.json',
    ]);
  });
});

describe('UNAVAILABLE', () => {
  it('is a catalog shape a KROMA server can still parse', () => {
    expect(JSON.parse(UNAVAILABLE)).toEqual({
      schema: 2,
      modules: [],
      error: 'catalog unavailable',
    });
  });
});
