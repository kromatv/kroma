import { afterEach, describe, expect, it, vi } from 'vitest';
import { machineResponse } from './api';
import { type Env, UNAVAILABLE } from './source';

const ctx = () => ({ waitUntil: vi.fn() });

const req = (path: string, init?: RequestInit) =>
  new Request(`https://modules.kroma.tv${path}`, init);

async function machine(path: string, init?: RequestInit, env: Env = {}): Promise<Response> {
  const res = await machineResponse(req(path, init), env, ctx());
  if (!res) throw new Error(`expected a machine response for ${path}`);
  return res;
}

const MARK = '<svg viewBox="0 0 24 24" />';

const CATALOG = {
  schema: 2,
  generatedAt: '2026-07-02T00:00:00Z',
  modules: [
    {
      id: 'tv.kroma.demo',
      name: 'Demo & Co',
      version: '1.0.0',
      description: 'A <demo> module',
      icon: `data:image/svg+xml;base64,${btoa(MARK)}`,
      artifacts: [{ target: 'wasm32', url: 'https://dl/a.kmod', size: 1, sha256: 'x' }],
    },
  ],
};

const FRESH = 'https://kroma-modules.cache/catalog-fresh';

function edgeCache() {
  const store = new Map<string, Response>();
  vi.stubGlobal('caches', {
    default: {
      match: vi.fn(async (key: string) => store.get(key)?.clone()),
      put: vi.fn(async (key: string, res: Response) => {
        store.set(key, res);
      }),
    },
  });
  return store;
}

function background() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
    settled: () => Promise.all(pending),
  };
}

function upstreamServing(body: unknown, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

function offline(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error(message);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('machineResponse', () => {
  it('answers /ping without touching the upstream', async () => {
    const calls = upstreamServing(CATALOG);
    expect(await (await machine('/ping')).text()).toBe('pong');
    expect(calls).toEqual([]);
  });

  it('serves the brand mark at /favicon.svg and /favicon.ico, never the catalog', async () => {
    for (const path of ['/favicon.svg', '/favicon.ico']) {
      const res = await machine(path);
      expect(res.headers.get('content-type')).toBe('image/svg+xml');
      expect(await res.text()).toContain('aria-label="KROMA"');
    }
  });

  it('answers the bare origin with the catalog when the caller did not ask for HTML', async () => {
    upstreamServing(CATALOG);
    const res = await machine('/');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual(CATALOG);
  });

  it('lets a browser at the bare origin fall through to the rendered page', async () => {
    const calls = upstreamServing(CATALOG);
    expect(
      await machineResponse(req('/', { headers: { accept: 'text/html' } }), {}, ctx()),
    ).toBeNull();
    expect(calls).toEqual([]);
  });

  it('serves the catalog at /modules.json and /all.json, browser or not', async () => {
    upstreamServing(CATALOG);
    for (const path of ['/modules.json', '/all.json']) {
      const res = await machine(path, { headers: { accept: 'text/html' } });
      expect(await res.json()).toEqual(CATALOG);
    }
  });

  it('treats a trailing slash as the same route', async () => {
    upstreamServing(CATALOG);
    expect(await (await machine('/modules.json/')).json()).toEqual(CATALOG);
  });

  it('falls through to the rendered site for any other path', async () => {
    const calls = upstreamServing(CATALOG);
    expect(await machineResponse(req('/browse'), {}, ctx())).toBeNull();
    expect(await machineResponse(req('/assets/app-abc123.js'), {}, ctx())).toBeNull();
    expect(calls).toEqual([]);
  });

  it('serves a module icon from the versioned path the catalog hands out', async () => {
    upstreamServing(CATALOG);
    const res = await machine('/icon/tv.kroma.demo/1.0.0.svg');
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe(MARK);
  });

  it('warms the edge cache in the background, on the icon route as on the catalog one', async () => {
    for (const path of ['/modules.json', '/icon/tv.kroma.demo/1.0.0.svg']) {
      const store = edgeCache();
      const calls = upstreamServing(CATALOG);
      const bg = background();

      await machineResponse(req(path), {}, bg);
      expect(bg.pending).toHaveLength(2);
      await bg.settled();
      expect(await store.get(FRESH)?.clone().json()).toEqual(CATALOG);

      await machineResponse(req(path), {}, bg);
      expect(calls).toHaveLength(1);
      vi.unstubAllGlobals();
    }
  });

  it('falls back to the ambient environment when the request arrives with no bindings', async () => {
    const calls = upstreamServing(CATALOG);
    vi.stubGlobal('process', { env: { GITHUB_REPO: 'ambient/fork' } });
    const res = await machineResponse(req('/modules.json'), undefined, ctx());
    expect(calls[0]).toBe('https://github.com/ambient/fork/releases/download/modules/modules.json');
    expect(await res?.json()).toEqual(CATALOG);
  });

  it('reads the configured repo and lets the catalog be cached for five minutes', async () => {
    const calls = upstreamServing(CATALOG);
    const res = await machine('/modules.json', undefined, { GITHUB_REPO: 'someone/fork' });
    expect(calls[0]).toBe('https://github.com/someone/fork/releases/download/modules/modules.json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers the unavailable payload with a short cache when nothing can produce one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    offline('offline');
    const res = await machine('/modules.json');
    expect(await res.text()).toBe(UNAVAILABLE);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('degrades the same way on a non-OK upstream status', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upstreamServing({ message: 'Not Found' }, 404);
    expect(await (await machine('/modules.json')).text()).toBe(UNAVAILABLE);
  });

  it('does not disclose the upstream failure to the caller', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    offline('connect ECONNREFUSED 10.0.0.7:443 fetching github.com');
    const raw = await (await machine('/modules.json')).text();
    expect(raw).not.toContain('ECONNREFUSED');
    expect(raw).not.toContain('10.0.0.7');
    expect(raw).not.toContain('github.com');
    expect(logged).toHaveBeenCalled();
  });
});
