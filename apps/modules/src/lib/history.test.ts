import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldReleases, moduleHistory } from './history';
import type { Env } from './source';

const CACHE_KEY = 'https://kroma-modules.cache/history-index';

type Asset = { name: string; browser_download_url: string; size: number };

const kmod = (tag: string, target = 'x86_64-unknown-linux-musl', size = 20): Asset => ({
  name: `${tag.split('@')[0]}-${target}.kmod`,
  browser_download_url: `https://dl.test/${tag}/bundle.kmod`,
  size,
});

const release = (tag: string, publishedAt: string | null, assets: Asset[] = [kmod(tag)]) => ({
  tag_name: tag,
  published_at: publishedAt,
  assets,
});

function upstream(releases: unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
      return Response.json(releases);
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

describe('foldReleases', () => {
  it('reads a module id and version out of its release tag', () => {
    const index = foldReleases([
      release('tv.kroma.vpn@0.1.4', '2026-03-01T00:00:00Z'),
      release('tv.kroma.vpn@0.1.3', '2026-02-01T00:00:00Z'),
    ]);
    expect(index['tv.kroma.vpn']).toEqual([
      {
        version: '0.1.4',
        tag: 'tv.kroma.vpn@0.1.4',
        publishedAt: '2026-03-01T00:00:00Z',
        url: 'https://dl.test/tv.kroma.vpn@0.1.4/bundle.kmod',
        size: 20,
      },
      {
        version: '0.1.3',
        tag: 'tv.kroma.vpn@0.1.3',
        publishedAt: '2026-02-01T00:00:00Z',
        url: 'https://dl.test/tv.kroma.vpn@0.1.3/bundle.kmod',
        size: 20,
      },
    ]);
  });

  it('ignores the releases that are not a module', () => {
    // The repo's other tags share the list: server versions, the nightly, and
    // the rolling catalog release this very worker reads.
    const index = foldReleases([
      release('v0.1.38', '2026-03-01T00:00:00Z'),
      release('nightly', '2026-03-01T00:00:00Z'),
      release('modules', '2026-03-01T00:00:00Z'),
      release('tv.kroma.mdns@0.1.0', '2026-01-01T00:00:00Z'),
    ]);
    expect(Object.keys(index)).toEqual(['tv.kroma.mdns']);
  });

  it('ignores a tag with an empty id or an empty version', () => {
    const index = foldReleases([release('@1.0.0', null), release('tv.kroma.x@', null)]);
    expect(index).toEqual({});
  });

  it('keeps one row per module even when several are released at once', () => {
    const index = foldReleases([
      release('tv.kroma.indexer@0.1.3', '2026-03-01T00:00:00Z'),
      release('tv.kroma.torznab@0.1.2', '2026-03-01T00:00:00Z'),
    ]);
    expect(Object.keys(index).sort()).toEqual(['tv.kroma.indexer', 'tv.kroma.torznab']);
    expect(index['tv.kroma.indexer']).toHaveLength(1);
  });

  it('carries no download link for a release whose bundles are missing', () => {
    const index = foldReleases([
      release('tv.kroma.vpn@0.1.4', null, [
        { name: 'notes.txt', browser_download_url: 'https://dl.test/notes.txt', size: 3 },
      ]),
    ]);
    expect(index['tv.kroma.vpn']?.[0]).toMatchObject({ url: null, size: null, publishedAt: null });
  });

  it('handles an id that itself contains an @', () => {
    // The version is after the LAST @, so a scoped-looking id cannot split wrong.
    const index = foldReleases([release('tv.kroma.engine@qbit@0.2.0', null)]);
    expect(Object.keys(index)).toEqual(['tv.kroma.engine@qbit']);
    expect(index['tv.kroma.engine@qbit']?.[0]?.version).toBe('0.2.0');
  });
});

describe('moduleHistory', () => {
  it('lists every released version of one module, newest first', async () => {
    vi.stubGlobal('caches', undefined);
    upstream([
      release('tv.kroma.indexer@0.1.3', '2026-03-01T00:00:00Z'),
      release('tv.kroma.whisper@0.1.1', '2026-02-15T00:00:00Z'),
      release('tv.kroma.indexer@0.1.2', '2026-02-01T00:00:00Z'),
    ]);

    const rows = await history({}, 'tv.kroma.indexer');
    expect(rows.map((r) => r.version)).toEqual(['0.1.3', '0.1.2']);
  });

  it('answers empty when the releases payload is not a list of releases', async () => {
    vi.stubGlobal('caches', undefined);
    upstream({ message: 'Bad credentials' });
    expect(await history({}, 'a')).toEqual([]);
  });

  it('names the configured repo and authenticates when a token is bound', async () => {
    vi.stubGlobal('caches', undefined);
    const calls = upstream([release('a@1.0.0', null)]);

    const rows = await history({ GITHUB_REPO: 'someone/fork', GITHUB_TOKEN: 'ghp_x' }, 'a');

    expect(calls[0]?.url).toBe('https://api.github.com/repos/someone/fork/releases?per_page=100');
    expect(calls[0]?.headers.authorization).toBe('Bearer ghp_x');
    // One request, not one per version: the tag list IS the history now.
    expect(calls).toHaveLength(1);
    expect(rows[0]?.publishedAt).toBeNull();
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
    upstream([release('a@1.0.0', '2026-01-01T00:00:00Z')]);
    expect(await history({}, 'tv.kroma.absent')).toEqual([]);
  });

  it('serves every module page from one cached index without touching GitHub', async () => {
    const { store } = edgeCache();
    const row = { version: '1.0.0', tag: 'a@1.0.0', publishedAt: null, url: null, size: null };
    store.set(CACHE_KEY, Response.json({ a: [row] }));
    const calls = upstream([]);

    expect(await history({}, 'a')).toEqual([row]);
    expect(await history({}, 'b')).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('rebuilds when the cached body is not an index, or not JSON at all', async () => {
    for (const cached of [Response.json({ a: 'not rows' }), new Response('<html>')]) {
      const { store } = edgeCache();
      store.set(CACHE_KEY, cached);
      upstream([release('a@1.0.0', '2026-01-01T00:00:00Z')]);

      expect((await history({}, 'a')).map((r) => r.version)).toEqual(['1.0.0']);
      vi.unstubAllGlobals();
    }
  });

  it('stores the built index for six hours, in the background', async () => {
    const { store } = edgeCache();
    upstream([release('a@1.0.0', '2026-01-01T00:00:00Z', [])]);
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
          tag: 'a@1.0.0',
          publishedAt: '2026-01-01T00:00:00Z',
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
