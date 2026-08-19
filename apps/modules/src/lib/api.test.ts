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

const DIGEST = 'ab'.repeat(32);
const SRI = `sha256-${btoa(String.fromCharCode(...Array(32).fill(0xab)))}`;

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
      engines: { server: '>=0.1.4' },
      dependencies: { 'tv.kroma.other': '^0.1.0' },
      provides: [{ kind: 'download-client', id: 'demo' }],
      artifacts: [
        {
          target: 'wasm32',
          url: 'https://dl/a.kmod',
          size: 1,
          sha256: DIGEST,
          contentHash: DIGEST,
        },
      ],
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
      const url = String(input);
      calls.push(url);
      // The releases listing is a different upstream; a test that does not care
      // about history gets an empty one.
      if (url.startsWith('https://api.github.com/')) return new Response('[]');
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

// The per-module release tags the pipeline cuts, which carry the versions the
// merged catalog does not.
function releasesServing(releases: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify(releases));
      return new Response(JSON.stringify(CATALOG));
    }),
  );
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

  it('sends /favicon.ico to the real asset instead of serving a second copy', async () => {
    const res = await machine('/favicon.ico');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://modules.kroma.tv/favicon.svg');
  });

  it('leaves /favicon.svg to the asset handler, which answers before this worker', async () => {
    expect(await machineResponse(req('/favicon.svg'), {}, ctx())).toBeNull();
  });

  it('keeps answering the bare origin with the legacy catalog', async () => {
    upstreamServing(CATALOG);
    const res = await machine('/');
    expect(res.headers.get('content-type')).toBe('application/json');
    // Deliberately unchanged: a current server pointed at a root appends
    // `/registry.json` itself, so moving this would serve nobody and would break
    // the servers still reading the old shape here.
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

  it('separates a route falling through from a route answering 404', async () => {
    upstreamServing(CATALOG);
    // Both are 404-shaped; only the first means "this is a page, not a document".
    expect(await machineResponse(req('/browse'), {}, ctx())).toBeNull();
    const missing = await machine('/m/tv.kroma.nope.json');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'no such module' });
  });

  it('answers only GET; a write to a document is not a route', async () => {
    upstreamServing(CATALOG);
    expect(await machineResponse(req('/index.json', { method: 'POST' }), {}, ctx())).toBeNull();
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

describe('the RFC-110 documents', () => {
  it('describes itself at /registry.json, naming the origin it was asked at', async () => {
    upstreamServing(CATALOG);
    expect(await (await machine('/registry.json')).json()).toEqual({
      apiVersion: 1,
      name: 'KROMA modules',
      url: 'https://modules.kroma.tv',
      modules: ['tv.kroma.demo'],
    });
  });

  it('serves the installable version of every module at /index.json', async () => {
    upstreamServing(CATALOG);
    const index = (await (await machine('/index.json')).json()) as Array<Record<string, unknown>>;
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({
      id: 'tv.kroma.demo',
      version: '1.0.0',
      engines: { server: '>=0.1.4' },
      dependencies: { 'tv.kroma.other': '^0.1.0' },
      tags: ['download-client'],
      artifacts: [{ target: 'wasm32', url: 'https://dl/a.kmod', size: 1, integrity: SRI }],
    });
  });

  it('serves one module record at /m/<id>.json', async () => {
    upstreamServing(CATALOG);
    const record = (await (await machine('/m/tv.kroma.demo.json')).json()) as {
      latest: string;
      distTags: Record<string, string>;
      versions: Record<string, { artifacts: Array<{ integrity: string }> }>;
    };
    expect(record.latest).toBe('1.0.0');
    expect(record.distTags).toEqual({ latest: '1.0.0' });
    expect(record.versions['1.0.0']?.artifacts[0]?.integrity).toBe(SRI);
  });

  it('carries every version the release tags hold, not just the catalog row', async () => {
    releasesServing([
      {
        tag_name: 'tv.kroma.demo@0.9.0',
        assets: [
          {
            name: 'tv.kroma.demo-wasm32.kmod',
            size: 9,
            browser_download_url: 'https://dl/old.kmod',
            digest: `sha256:${DIGEST}`,
          },
        ],
      },
    ]);
    const record = (await (await machine('/m/tv.kroma.demo.json')).json()) as {
      latest: string;
      versions: Record<string, unknown>;
    };
    expect(Object.keys(record.versions).sort()).toEqual(['0.9.0', '1.0.0']);
    // The catalog still names which one a bare install resolves to.
    expect(record.latest).toBe('1.0.0');
  });

  it('404s a module the registry does not carry', async () => {
    upstreamServing(CATALOG);
    expect((await machine('/m/tv.kroma.nope.json')).status).toBe(404);
  });

  it('503s rather than reporting an empty registry when the catalog cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    offline('offline');
    for (const path of ['/registry.json', '/index.json', '/m/tv.kroma.demo.json']) {
      const res = await machine(path);
      expect(res.status, path).toBe(503);
    }
  });

  it('answers the descriptor and the index a pasted root resolves to', async () => {
    upstreamServing(CATALOG);
    // A server given the root appends `/registry.json`, so these two are what an
    // operator pasting `https://modules.kroma.tv` actually reaches.
    const descriptor = (await (await machine('/registry.json')).json()) as { modules: string[] };
    expect(descriptor.modules).toEqual(['tv.kroma.demo']);
    const index = (await (await machine('/index.json')).json()) as unknown[];
    expect(index).toHaveLength(descriptor.modules.length);
  });

  it('serves the JSON Schema for each document without reading the catalog', async () => {
    const calls = upstreamServing(CATALOG);
    for (const name of ['manifest', 'registry', 'index', 'module']) {
      const res = await machine(`/schemas/${name}.json`);
      const schema = (await res.json()) as Record<string, unknown>;
      expect(schema.$schema, name).toBe('https://json-schema.org/draft/2020-12/schema');
      // Open-world: a registry may carry fields a later apiVersion defines.
      expect(JSON.stringify(schema), name).not.toContain('"additionalProperties":false');
    }
    expect(calls, 'the spec does not depend on the upstream catalog').toEqual([]);
    expect(await machineResponse(req('/schemas/nope.json'), {}, ctx())).toBeNull();
  });

  it('answers a pinned schema url, and only for a version it publishes', async () => {
    upstreamServing(CATALOG);
    // What a manifest's `$schema` points at. It has to keep resolving to the
    // schema it was pinned to, which is why versions are files and not edits.
    const pinned = (await (await machine('/schemas/2/manifest.json')).json()) as {
      $id: string;
    };
    expect(pinned.$id).toBe('https://modules.kroma.tv/schemas/2/manifest.json');
    expect(await machineResponse(req('/schemas/9/manifest.json'), {}, ctx())).toBeNull();
  });

  it('leaves any other /m/ path to the rendered site', async () => {
    upstreamServing(CATALOG);
    expect(await machineResponse(req('/m/tv.kroma.demo'), {}, ctx())).toBeNull();
    expect(await machineResponse(req('/m/a/b.json'), {}, ctx())).toBeNull();
  });
});
