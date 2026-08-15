import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  archSupported,
  type Catalog,
  cmpDsmVersion,
  DEFAULT_REPO,
  dsmVersion,
  type Entry,
  entryVersion,
  loadCatalog,
  type SpkInfo,
  toDsmPackage,
  versionFromSpkName,
} from './catalog';

function entry(over: Partial<Entry> = {}): Entry {
  return {
    channel: 'stable',
    tag: 'v0.1.25',
    releaseName: 'KROMA 0.1.25',
    releaseUrl: 'https://github.com/maxscharwath/kroma/releases/tag/v0.1.25',
    publishedAt: '2026-07-01T00:00:00Z',
    spkName: 'kroma-0.1.25-3439372-x86_64.spk',
    spkUrl: 'https://example/kroma.spk',
    spkSize: 1048576,
    notes: '',
    info: null,
    ...over,
  };
}

const info: SpkInfo = {
  package: 'kroma',
  version: '0.1.25-3439372',
  dname: 'KROMA',
  desc: 'desc',
  arch: 'x86_64',
  firmware: '7.0-40000',
  size: 2097152,
  md5: 'abc123',
  beta: false,
};

describe('versionFromSpkName', () => {
  it('extracts version-build from a kroma spk name', () => {
    expect(versionFromSpkName('kroma-0.1.25-3439372-x86_64.spk')).toBe('0.1.25-3439372');
  });

  it('parses a pre-rebrand luma spk name (prefix-agnostic)', () => {
    expect(versionFromSpkName('luma-1.0.0-deadbee-x64.spk')).toBe('1.0.0-deadbee');
  });

  it('falls back to the name minus .spk when the pattern does not match', () => {
    expect(versionFromSpkName('weird.spk')).toBe('weird');
    // Uppercase prefix does not match [a-z]+, so it falls back too.
    expect(versionFromSpkName('KROMA-1.0-x64.spk')).toBe('KROMA-1.0-x64');
  });
});

describe('entryVersion', () => {
  it('prefers the sidecar info version', () => {
    expect(entryVersion(entry({ info }))).toBe('0.1.25-3439372');
  });

  it('derives from the spk name when there is no sidecar', () => {
    expect(entryVersion(entry())).toBe('0.1.25-3439372');
  });
});

describe('cmpDsmVersion', () => {
  it('orders by dotted feature segments numerically', () => {
    expect(cmpDsmVersion('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(cmpDsmVersion('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('compares the build suffix when the feature version ties', () => {
    expect(cmpDsmVersion('0.1.25-3439372', '0.1.25-3439300')).toBeGreaterThan(0);
    expect(cmpDsmVersion('0.1.25-100', '0.1.25-100')).toBe(0);
  });

  it('treats a missing build as 0 and missing segments as 0', () => {
    expect(cmpDsmVersion('1.0', '1.0.0')).toBe(0);
    expect(cmpDsmVersion('1.0.1', '1.0')).toBeGreaterThan(0);
  });

  it('tolerates non-numeric segments as 0', () => {
    expect(cmpDsmVersion('x.y', 'a.b')).toBe(0);
  });
});

describe('archSupported', () => {
  it('is permissive for a null arch', () => {
    expect(archSupported(null)).toBe(true);
  });

  it('accepts the x86_64 codename families (case-insensitive) and noarch', () => {
    expect(archSupported('x86_64')).toBe(true);
    expect(archSupported('X64')).toBe(true);
    expect(archSupported('apollolake')).toBe(true);
    expect(archSupported('EPYC7002')).toBe(true);
    expect(archSupported('noarch')).toBe(true);
  });

  it('rejects an unrelated arch', () => {
    expect(archSupported('armv7')).toBe(false);
    expect(archSupported('aarch64')).toBe(false);
  });
});

describe('dsmVersion', () => {
  it('leaves a conventional 3-segment version untouched', () => {
    expect(dsmVersion('0.1.31-3447024')).toBe('0.1.31-3447024');
  });

  // The bug this shape exists to prevent: build.sh stamped INFO one way while
  // the catalog advertised another, so the installed version outranked
  // everything on offer and no Update button ever appeared. What build.sh
  // writes has to reach the catalog untouched.
  it('hands back what build.sh stamps, so INFO and the catalog agree', () => {
    for (const stamped of ['0.1.38.3482844', '0.1.38.3482771', '1.0.0.1']) {
      expect(dsmVersion(stamped)).toBe(stamped);
    }
  });

  it('offers an update over an install of the same X.Y.Z, with no version bump', () => {
    expect(cmpDsmVersion(dsmVersion('0.1.38.3482844'), '0.1.38.3480473')).toBeGreaterThan(0);
  });

  it('drops the redundant suffix of the older doubly-stamped X.Y.Z.BUILD-BUILD', () => {
    expect(dsmVersion('0.1.31.3447024-3447024')).toBe('0.1.31.3447024');
    expect(dsmVersion('0.1.36.3461233-3461233')).toBe(dsmVersion('0.1.36.3461233'));
  });

  it('handles a build-less and a short version', () => {
    expect(dsmVersion('1.2.3')).toBe('1.2.3');
    expect(dsmVersion('23.10-3')).toBe('23.10-3');
  });

  it('takes the first dashed segment of a nightly, not the rest of the string', () => {
    expect(dsmVersion('1.2.3-nightly-20260811')).toBe('1.2.3-nightly');
  });
});

describe('toDsmPackage', () => {
  it('fills defaults when there is no sidecar info', () => {
    const pkg = toDsmPackage(entry(), 'https://pkg.kroma.tv', 'maxscharwath/kroma');
    expect(pkg.package).toBe('kroma');
    expect(pkg.version).toBe('0.1.25-3439372');
    expect(pkg.dname).toBe('KROMA');
    expect(pkg.link).toBe('https://example/kroma.spk');
    expect(pkg.size).toBe(1048576); // falls back to entry spkSize
    expect(pkg.md5).toBeUndefined();
    expect(pkg.firmware).toBe('7.0-40000');
    // No `beta` field at all - DSM hides `beta:true` from a dynamic source.
    expect('beta' in pkg).toBe(false);
    expect(pkg.thumbnail).toEqual(['https://pkg.kroma.tv/icon.png']);
    expect(pkg.maintainer_url).toBe('https://github.com/maxscharwath/kroma');
    expect(pkg.changelog).toBe(entry().releaseUrl);
  });

  it('prefers sidecar fields and never emits a beta flag for a nightly', () => {
    const pkg = toDsmPackage(
      entry({ info, channel: 'nightly' }),
      'https://pkg.kroma.tv',
      'maxscharwath/kroma',
    );
    expect(pkg.version).toBe('0.1.25-3439372');
    expect(pkg.size).toBe(2097152); // sidecar size wins
    expect(pkg.md5).toBe('abc123');
    expect(pkg.desc).toBe('desc');
    expect('beta' in pkg).toBe(false);
  });
});

describe('DEFAULT_REPO', () => {
  it('points at the kroma repo', () => {
    expect(DEFAULT_REPO).toBe('maxscharwath/kroma');
  });
});

const asset = (name: string, url = `https://dl/${name}`) => ({
  name,
  size: 1024,
  browser_download_url: url,
});

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v1.0.0',
  name: 'KROMA 1.0.0',
  draft: false,
  prerelease: false,
  published_at: '2026-07-01T00:00:00Z',
  html_url: 'https://github.com/o/r/releases/v1.0.0',
  assets: [asset('kroma-1.0.0-1-x86_64.spk')],
  ...over,
});

function ghServing(releases: unknown[], sidecars: Record<string, unknown> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (new URL(url).hostname === 'api.github.com') {
        return new Response(JSON.stringify(releases), { status: 200 });
      }
      const body = sidecars[url];
      if (body === undefined) return new Response('', { status: 404 });
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
}

function stubEdgeCache(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const cache = {
    match: vi.fn(async (key: string) => {
      const body = store.get(key);
      return body === undefined ? undefined : new Response(body);
    }),
    put: vi.fn(async (key: string, res: Response) => {
      store.set(key, await res.text());
    }),
  };
  vi.stubGlobal('caches', { default: cache });
  return { cache, store };
}

const drain = () => {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    settled: () => Promise.all(pending),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const headersOf = (calls: { init?: RequestInit }[]) =>
  (calls[0]?.init?.headers ?? {}) as Record<string, string>;

describe('loadCatalog', () => {
  it('authenticates the GitHub call only when a token is configured', async () => {
    const anonymous = ghServing([]);
    await loadCatalog({}, () => undefined);
    expect(headersOf(anonymous).authorization).toBeUndefined();

    vi.unstubAllGlobals();
    const authenticated = ghServing([]);
    await loadCatalog({ GITHUB_TOKEN: 'ghp_x' }, () => undefined);
    expect(headersOf(authenticated).authorization).toBe('Bearer ghp_x');
  });

  it('asks the configured repo, falling back to the default one', async () => {
    const calls = ghServing([]);
    await loadCatalog({ GITHUB_REPO: 'someone/fork' }, () => undefined);
    expect(calls[0]?.url).toBe('https://api.github.com/repos/someone/fork/releases?per_page=100');
    expect((await loadCatalog({}, () => undefined)).repo).toBe(DEFAULT_REPO);
  });

  it('throws when the releases API refuses, rather than publishing an empty catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 403 })),
    );
    await expect(loadCatalog({}, () => undefined)).rejects.toThrow('GitHub releases API 403');
  });

  it('skips a draft, a release with no .spk, and a prerelease that is not the nightly', async () => {
    ghServing([
      release({ tag_name: 'v9.9.9', draft: true }),
      release({ tag_name: 'desktop-latest', assets: [asset('KROMA.dmg')] }),
      release({ tag_name: 'v2.0.0-rc1', prerelease: true }),
      release(),
    ]);
    const catalog = await loadCatalog({}, () => undefined);
    expect(catalog.entries.map((e) => e.tag)).toEqual(['v1.0.0']);
  });

  it('treats the moving `nightly` tag as the nightly channel', async () => {
    ghServing([
      release({ tag_name: 'v1.0.0', published_at: '2026-07-01T00:00:00Z' }),
      release({ tag_name: 'v1.1.0', published_at: '2026-07-05T00:00:00Z' }),
      release({
        tag_name: 'nightly',
        prerelease: true,
        published_at: '2026-06-01T00:00:00Z',
        assets: [asset('kroma-1.2.0-2-x86_64.spk')],
      }),
    ]);
    const catalog = await loadCatalog({}, () => undefined);
    expect(catalog.entries.map((e) => [e.channel, e.tag])).toEqual([
      ['nightly', 'nightly'],
      ['stable', 'v1.1.0'],
      ['stable', 'v1.0.0'],
    ]);
  });

  it('orders by version, not by publish date', async () => {
    ghServing([
      release({
        tag_name: 'v1.9.0',
        published_at: '2026-07-01T00:00:00Z',
        assets: [asset('kroma-1.9.0-10-x86_64.spk')],
      }),
      release({
        tag_name: 'v1.10.0',
        published_at: '2026-07-05T00:00:00Z',
        assets: [asset('kroma-1.10.0-11-x86_64.spk')],
      }),
      // Republished later than both, but an older version: date must not win.
      release({
        tag_name: 'v1.2.0',
        published_at: '2026-07-30T00:00:00Z',
        assets: [asset('kroma-1.2.0-3-x86_64.spk')],
      }),
    ]);
    const catalog = await loadCatalog({}, () => undefined);
    expect(catalog.entries.map((e) => e.tag)).toEqual(['v1.10.0', 'v1.9.0', 'v1.2.0']);
  });

  it('sorts a nightly below a stable it is behind, channel notwithstanding', async () => {
    ghServing([
      release({ tag_name: 'v2.0.0', assets: [asset('kroma-2.0.0-9-x86_64.spk')] }),
      release({
        tag_name: 'nightly',
        prerelease: true,
        assets: [asset('kroma-1.0.0-1-x86_64.spk')],
      }),
    ]);
    const catalog = await loadCatalog({}, () => undefined);
    expect(catalog.entries.map((e) => e.channel)).toEqual(['stable', 'nightly']);
  });

  it('dates the rolling nightly by its .spk asset, not the tag it reuses', async () => {
    ghServing([
      release({
        tag_name: 'nightly',
        prerelease: true,
        published_at: '2026-07-10T19:42:27Z',
        assets: [
          {
            ...asset('kroma-1.0.0.7-x86_64.spk'),
            updated_at: '2026-08-10T11:27:55Z',
          },
        ],
      }),
      release({ tag_name: 'v1.0.0', published_at: '2026-07-31T00:00:00Z' }),
    ]);
    const catalog = await loadCatalog({}, () => undefined);
    const nightly = catalog.entries.find((e) => e.channel === 'nightly');
    const stable = catalog.entries.find((e) => e.channel === 'stable');
    expect(nightly?.publishedAt).toBe('2026-08-10T11:27:55Z');
    // A tagged release keeps the release date; only the rolling tag is special.
    expect(stable?.publishedAt).toBe('2026-07-31T00:00:00Z');
  });

  it('lists the newest .spk when the nightly tag holds several builds', async () => {
    ghServing([
      release({
        tag_name: 'nightly',
        prerelease: true,
        assets: [
          { ...asset('kroma-0.1.36.100-x86_64.spk'), updated_at: '2026-08-09T00:00:00Z' },
          { ...asset('kroma-0.1.36.300-x86_64.spk'), updated_at: '2026-08-11T00:00:00Z' },
          { ...asset('kroma-0.1.36.200-x86_64.spk'), updated_at: '2026-08-10T00:00:00Z' },
        ],
      }),
    ]);
    const [entry] = (await loadCatalog({}, () => undefined)).entries;
    expect(entry?.spkName).toBe('kroma-0.1.36.300-x86_64.spk');
  });

  it('names an unnamed release by its tag and tolerates a missing publish date', async () => {
    ghServing([release({ name: null, published_at: null })]);
    const [entry] = (await loadCatalog({}, () => undefined)).entries;
    expect(entry?.releaseName).toBe('v1.0.0');
    expect(entry?.publishedAt).toBe('');
  });

  it('attaches the .info.json sidecar beside the .spk', async () => {
    const sidecar = { ...info, md5: 'sidecar-md5' };
    ghServing(
      [
        release({
          assets: [
            asset('kroma-1.0.0-1-x86_64.spk'),
            asset('kroma-1.0.0-1-x86_64.spk.info.json', 'https://dl/info.json'),
          ],
        }),
      ],
      { 'https://dl/info.json': sidecar },
    );
    const [entry] = (await loadCatalog({}, () => undefined)).entries;
    expect(entry?.info?.md5).toBe('sidecar-md5');
  });

  it('keeps the entry when the sidecar 404s or the fetch throws', async () => {
    for (const sidecars of [{}, { 'https://dl/info.json': new Error('reset') }]) {
      vi.unstubAllGlobals();
      ghServing(
        [
          release({
            assets: [
              asset('kroma-1.0.0-1-x86_64.spk'),
              asset('kroma-1.0.0-1-x86_64.spk.info.json', 'https://dl/info.json'),
            ],
          }),
        ],
        sidecars,
      );
      const [entry] = (await loadCatalog({}, () => undefined)).entries;
      expect(entry?.spkName).toBe('kroma-1.0.0-1-x86_64.spk');
      expect(entry?.info).toBeNull();
    }
  });

  it('answers from the fresh edge copy without calling GitHub at all', async () => {
    const cached: Catalog = { fetchedAt: 'then', repo: 'cached/repo', entries: [] };
    stubEdgeCache({ 'https://kroma-packages.cache/catalog-fresh': JSON.stringify(cached) });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await loadCatalog({}, () => undefined)).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes both a 5-minute and a week-long copy on a miss', async () => {
    const { cache } = stubEdgeCache();
    ghServing([release()]);
    const ctx = drain();
    await loadCatalog({}, ctx.waitUntil);
    await ctx.settled();
    const written = cache.put.mock.calls.map(([key]) => key);
    expect(written).toEqual([
      'https://kroma-packages.cache/catalog-fresh',
      'https://kroma-packages.cache/catalog-stale',
    ]);
    expect(cache.put.mock.calls[1]?.[1].headers.get('cache-control')).toBe(
      'public, max-age=604800',
    );
  });

  it('holds the catalog in memory for five minutes where there is no edge cache', async () => {
    const calls = ghServing([release()]);
    const env = {};
    const first = await loadCatalog(env, () => undefined);
    const second = await loadCatalog(env, () => undefined);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it('keys that hold on the env, so a changed binding never answers stale', async () => {
    const calls = ghServing([release()]);
    await loadCatalog({ GITHUB_REPO: 'someone/fork' }, () => undefined);
    await loadCatalog({ GITHUB_REPO: 'another/fork' }, () => undefined);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.github.com/repos/someone/fork/releases?per_page=100',
      'https://api.github.com/repos/another/fork/releases?per_page=100',
    ]);
  });

  it('answers from the expired memory copy when GitHub then goes down', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
    ghServing([release()]);
    const env = {};
    const first = await loadCatalog(env, () => undefined);

    vi.setSystemTime(new Date('2026-08-01T00:06:00Z'));
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await loadCatalog(env, () => undefined)).toBe(first);
  });

  it('serves the week-old copy when GitHub is down, and rethrows when there is none', async () => {
    const stale: Catalog = { fetchedAt: 'then', repo: 'stale/repo', entries: [] };
    stubEdgeCache({ 'https://kroma-packages.cache/catalog-stale': JSON.stringify(stale) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await loadCatalog({}, () => undefined)).toEqual(stale);

    vi.unstubAllGlobals();
    stubEdgeCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(loadCatalog({}, () => undefined)).rejects.toThrow('offline');
  });
});
