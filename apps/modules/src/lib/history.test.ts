import { afterEach, describe, expect, it, vi } from 'vitest';
import { moduleHistory } from './history';
import type { Env } from './source';

const CACHE_KEY = 'https://kroma-modules.cache/history-index';

type Asset = { name: string; browser_download_url: string };

const assetsFor = (tag: string): Asset[] => [
  { name: 'modules.json', browser_download_url: `https://dl.test/${tag}/modules.json` },
];

const release = (tag: string, publishedAt: string | null, assets = assetsFor(tag)) => ({
  tag_name: tag,
  published_at: publishedAt,
  assets,
});

function upstream(releases: unknown, catalogs: Record<string, unknown> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.startsWith('https://api.github.com/')) return Response.json(releases);
      const body = catalogs[url];
      if (body === undefined) return new Response('no such asset', { status: 404 });
      if (typeof body === 'string') return new Response(body);
      return Response.json(body);
    }),
  );
  return calls;
}

function edgeCache() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: string) => store.get(key)?.clone()),
    put: vi.fn(async (key: string, res: Response) => {
      store.set(key, res);
    }),
  };
  vi.stubGlobal('caches', { default: cache });
  return { store, cache };
}

function background() {
  const pending: Promise<unknown>[] = [];
  const waitUntil = (p: Promise<unknown>) => {
    pending.push(p);
  };
  return { waitUntil, pending, settled: () => Promise.all(pending) };
}

const history = (env: Env, id: string, waitUntil = () => {}) => moduleHistory(env, waitUntil, id);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('moduleHistory', () => {
  it('collapses the runs of releases that shipped one version into a single row', async () => {
    vi.stubGlobal('caches', undefined);
    upstream(
      [
        release('v0.3.0', '2026-03-01T00:00:00Z'),
        release('v0.2.0', '2026-02-01T00:00:00Z'),
        release('v0.1.0', '2026-01-01T00:00:00Z'),
      ],
      {
        'https://dl.test/v0.3.0/modules.json': {
          modules: [
            {
              id: 'tv.kroma.vpn',
              version: '2.0.0',
              artifacts: [
                { target: 'aarch64-apple-darwin', url: 'https://dl.test/vpn-mac.kmod', size: 10 },
                {
                  target: 'x86_64-unknown-linux-musl',
                  url: 'https://dl.test/vpn-linux.kmod',
                  size: 20,
                },
              ],
            },
          ],
        },
        'https://dl.test/v0.2.0/modules.json': {
          modules: [{ id: 'tv.kroma.vpn', version: '2.0.0' }],
        },
        'https://dl.test/v0.1.0/modules.json': {
          modules: [
            { id: 'tv.kroma.vpn', version: '1.0.0', url: 'https://dl.test/vpn-1.kmod', size: 5 },
          ],
        },
      },
    );

    expect(await history({}, 'tv.kroma.vpn')).toEqual([
      {
        version: '2.0.0',
        first: 'v0.2.0',
        firstAt: '2026-02-01T00:00:00Z',
        last: 'v0.3.0',
        url: 'https://dl.test/vpn-linux.kmod',
        size: 20,
      },
      {
        version: '1.0.0',
        first: 'v0.1.0',
        firstAt: '2026-01-01T00:00:00Z',
        last: 'v0.1.0',
        url: 'https://dl.test/vpn-1.kmod',
        size: 5,
      },
    ]);
  });

  it('reopens a version that comes back after another one, rather than editing the old row', async () => {
    vi.stubGlobal('caches', undefined);
    upstream(
      [
        release('v3', '2026-03-01T00:00:00Z'),
        release('v2', '2026-02-01T00:00:00Z'),
        release('v1', '2026-01-01T00:00:00Z'),
      ],
      {
        'https://dl.test/v3/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
        'https://dl.test/v2/modules.json': { modules: [{ id: 'a', version: '0.9.0' }] },
        'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
      },
    );

    const rows = await history({}, 'a');
    expect(rows.map((r) => [r.version, r.first, r.last])).toEqual([
      ['1.0.0', 'v3', 'v3'],
      ['0.9.0', 'v2', 'v2'],
      ['1.0.0', 'v1', 'v1'],
    ]);
  });

  it('skips a release with no modules.json and a module entry with no version', async () => {
    vi.stubGlobal('caches', undefined);
    const calls = upstream(
      [
        release('v2', '2026-02-01T00:00:00Z', [
          { name: 'kroma-linux.tar.gz', browser_download_url: 'https://dl.test/v2/bin.tar.gz' },
        ]),
        release('v1', '2026-01-01T00:00:00Z'),
      ],
      {
        'https://dl.test/v1/modules.json': {
          modules: [{ id: 'tv.kroma.vpn', version: '1.0.0' }, { id: 'tv.kroma.draft' }],
        },
      },
    );

    expect((await history({}, 'tv.kroma.vpn')).map((r) => r.last)).toEqual(['v1']);
    expect(await history({}, 'tv.kroma.draft')).toEqual([]);
    expect(calls.some((c) => c.url === 'https://dl.test/v2/bin.tar.gz')).toBe(false);
  });

  it('reads back at most twenty-five releases', async () => {
    vi.stubGlobal('caches', undefined);
    const tags = Array.from({ length: 30 }, (_, i) => `v${30 - i}`);
    const calls = upstream(
      tags.map((tag) => release(tag, '2026-01-01T00:00:00Z')),
      Object.fromEntries(
        tags.map((tag) => [
          `https://dl.test/${tag}/modules.json`,
          { modules: [{ id: 'a', version: tag }] },
        ]),
      ),
    );

    expect(await history({}, 'a')).toHaveLength(25);
    expect(calls.filter((c) => c.url.startsWith('https://dl.test/'))).toHaveLength(25);
  });

  it('drops a release whose modules.json is gone or unparseable', async () => {
    vi.stubGlobal('caches', undefined);
    upstream(
      [
        release('v3', '2026-03-01T00:00:00Z'),
        release('v2', '2026-02-01T00:00:00Z'),
        release('v1', '2026-01-01T00:00:00Z'),
      ],
      {
        'https://dl.test/v2/modules.json': { modules: 'not an array' },
        'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
      },
    );

    expect((await history({}, 'a')).map((r) => r.last)).toEqual(['v1']);
  });

  it('drops a release whose modules.json is not JSON at all', async () => {
    vi.stubGlobal('caches', undefined);
    upstream([release('v2', '2026-02-01T00:00:00Z'), release('v1', '2026-01-01T00:00:00Z')], {
      'https://dl.test/v2/modules.json': '<!doctype html><title>404</title>',
      'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
    });

    expect((await history({}, 'a')).map((r) => r.last)).toEqual(['v1']);
  });

  it('keeps no publication date on a run whose oldest release carries none', async () => {
    vi.stubGlobal('caches', undefined);
    upstream([release('v2', '2026-02-01T00:00:00Z'), release('v1', null)], {
      'https://dl.test/v2/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
      'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
    });

    expect(await history({}, 'a')).toEqual([
      {
        version: '1.0.0',
        first: 'v1',
        firstAt: null,
        last: 'v2',
        url: null,
        size: null,
      },
    ]);
  });

  it('answers empty when the releases payload is not a list of releases', async () => {
    vi.stubGlobal('caches', undefined);
    upstream({ message: 'Bad credentials' });
    expect(await history({}, 'a')).toEqual([]);
  });

  it('names the configured repo and authenticates when a token is bound', async () => {
    vi.stubGlobal('caches', undefined);
    const calls = upstream([release('v1', null)], {
      'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
    });

    const rows = await history({ GITHUB_REPO: 'someone/fork', GITHUB_TOKEN: 'ghp_x' }, 'a');

    expect(calls[0]?.url).toBe('https://api.github.com/repos/someone/fork/releases?per_page=100');
    expect(calls[0]?.headers.authorization).toBe('Bearer ghp_x');
    expect(calls[1]?.headers.authorization).toBe('Bearer ghp_x');
    expect(rows[0]?.firstAt).toBeNull();
  });

  it('sends no authorization header when no token is bound', async () => {
    vi.stubGlobal('caches', undefined);
    const calls = upstream([]);
    await history({}, 'a');
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.headers['user-agent']).toBe('kroma-module-registry');
  });

  it('answers an unknown module id with no history at all', async () => {
    vi.stubGlobal('caches', undefined);
    upstream([release('v1', '2026-01-01T00:00:00Z')], {
      'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
    });
    expect(await history({}, 'tv.kroma.absent')).toEqual([]);
  });

  it('serves every module page from one cached index without touching GitHub', async () => {
    const { store } = edgeCache();
    store.set(
      CACHE_KEY,
      Response.json({
        a: [{ version: '1.0.0', first: 'v1', firstAt: null, last: 'v2', url: null, size: null }],
      }),
    );
    const calls = upstream([]);

    expect(await history({}, 'a')).toEqual([
      { version: '1.0.0', first: 'v1', firstAt: null, last: 'v2', url: null, size: null },
    ]);
    expect(await history({}, 'b')).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('rebuilds when the cached body is not an index, or not JSON at all', async () => {
    for (const cached of [Response.json({ a: 'not rows' }), new Response('<html>')]) {
      const { store } = edgeCache();
      store.set(CACHE_KEY, cached);
      upstream([release('v1', '2026-01-01T00:00:00Z')], {
        'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
      });

      expect((await history({}, 'a')).map((r) => r.version)).toEqual(['1.0.0']);
      vi.unstubAllGlobals();
    }
  });

  it('stores the built index for six hours, in the background', async () => {
    const { store } = edgeCache();
    upstream([release('v1', '2026-01-01T00:00:00Z')], {
      'https://dl.test/v1/modules.json': { modules: [{ id: 'a', version: '1.0.0' }] },
    });
    const { waitUntil, pending, settled } = background();

    await moduleHistory({}, waitUntil, 'a');
    expect(pending).toHaveLength(1);
    await settled();

    const stored = store.get(CACHE_KEY);
    expect(stored?.headers.get('cache-control')).toBe('max-age=21600');
    expect(stored?.headers.get('content-type')).toBe('application/json');
    expect(await stored?.clone().json()).toEqual({
      a: [
        {
          version: '1.0.0',
          first: 'v1',
          firstAt: '2026-01-01T00:00:00Z',
          last: 'v1',
          url: null,
          size: null,
        },
      ],
    });
  });

  it('does not cache an empty index, so a bad hour is not frozen in for six', async () => {
    const { store } = edgeCache();
    upstream([]);
    const { waitUntil, settled } = background();

    expect(await moduleHistory({}, waitUntil, 'a')).toEqual([]);
    await settled();
    expect(store.has(CACHE_KEY)).toBe(false);
  });

  it('answers empty and logs when GitHub cannot be reached', async () => {
    vi.stubGlobal('caches', undefined);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.7:443');
      }),
    );

    expect(await history({}, 'a')).toEqual([]);
    expect(logged).toHaveBeenCalled();
  });

  it('answers empty when the releases API refuses the request', async () => {
    vi.stubGlobal('caches', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 403 })),
    );

    expect(await history({}, 'a')).toEqual([]);
  });
});
