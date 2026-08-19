import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ExecCtx, machineResponse } from './api';
import type { Env } from './catalog';

const ICON_SRC =
  'https://raw.githubusercontent.com/maxscharwath/kroma/main/clients/synology/spk/PACKAGE_ICON_256.PNG';

const ctx = () => ({ waitUntil: vi.fn() });

const deferring = () => {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
    settled: () => Promise.all(pending),
  };
};

const req = (path: string, init?: RequestInit) =>
  new Request(`https://packages.kroma.tv${path}`, init);

async function machine(
  path: string,
  init?: RequestInit,
  env: Env = {},
  context: ExecCtx = ctx(),
): Promise<Response> {
  const res = await machineResponse(req(path, init), env, context);
  if (!res) throw new Error(`expected a machine response for ${path}`);
  return res;
}

const packagesOf = async (res: Response) =>
  ((await res.json()) as { packages: { version?: string; channel?: string; link?: string }[] })
    .packages;

const asset = (name: string) => ({
  name,
  size: 1024,
  browser_download_url: `https://dl/${name}`,
});

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v1.2.3',
  name: 'KROMA 1.2.3',
  draft: false,
  prerelease: false,
  published_at: '2026-07-01T00:00:00Z',
  html_url: 'https://github.com/o/r/releases/v1.2.3',
  assets: [asset('kroma-1.2.3-3439372-x86_64.spk')],
  ...over,
});

const NIGHTLY = release({
  tag_name: 'nightly',
  name: 'nightly',
  prerelease: true,
  published_at: '2026-07-02T00:00:00Z',
  assets: [asset('kroma-1.3.0-9000001-x86_64.spk')],
});

function ghServing(releases: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (new URL(url).hostname === 'api.github.com') {
        return new Response(JSON.stringify(releases), { status: 200 });
      }
      return new Response('', { status: 404 });
    }),
  );
  return calls;
}

function fetchServing(body: string, status = 200) {
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

function offline(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error(message);
    }),
  );
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('machineResponse', () => {
  it('answers /ping without touching GitHub', async () => {
    const calls = ghServing([release()]);
    expect(await (await machine('/ping')).text()).toBe('pong');
    expect(calls).toEqual([]);
  });

  it('sends /favicon.ico to the real asset instead of serving a second copy', async () => {
    const res = await machine('/favicon.ico');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://packages.kroma.tv/favicon.svg');
  });

  it('leaves /favicon.svg to the asset handler, which answers before this worker', async () => {
    expect(await machineResponse(req('/favicon.svg'), {}, ctx())).toBeNull();
  });

  it('offers the stable release as a DSM package on /catalog.json', async () => {
    ghServing([release()]);
    const packages = await packagesOf(await machine('/catalog.json'));
    expect(packages).toHaveLength(1);
    expect(packages[0]?.version).toBe('1.2.3-3439372');
  });

  it('answers /nightly.json with the nightly, and /catalog.json with neither', async () => {
    ghServing([NIGHTLY]);
    expect((await packagesOf(await machine('/nightly.json')))[0]?.version).toBe('1.3.0-9000001');
    expect(await packagesOf(await machine('/catalog.json'))).toEqual([]);
  });

  it('answers /nightly.json with an empty list while no nightly has been cut', async () => {
    ghServing([release()]);
    expect(await packagesOf(await machine('/nightly.json'))).toEqual([]);
  });

  it('warms the edge cache in the background, so the next probe skips GitHub', async () => {
    const { store } = stubEdgeCache();
    const calls = ghServing([release()]);
    const deferred = deferring();

    const first = await machine('/catalog.json', undefined, {}, deferred);
    expect((await packagesOf(first))[0]?.version).toBe('1.2.3-3439372');

    await deferred.settled();
    const written = store.get('https://kroma-packages.cache/catalog-fresh');
    const cached = JSON.parse(written ?? '{}') as { entries?: { spkName: string }[] };
    expect(cached.entries?.[0]?.spkName).toBe('kroma-1.2.3-3439372-x86_64.spk');

    const second = await machine('/catalog.json');
    expect((await packagesOf(second))[0]?.version).toBe('1.2.3-3439372');
    expect(calls).toHaveLength(1);
  });

  it('lists every channel with its release detail on /all.json', async () => {
    ghServing([release(), NIGHTLY]);
    const body = (await (await machine('/all.json')).json()) as {
      fetchedAt: string;
      repo: string;
      packages: { channel: string; version: string; link: string; release: string }[];
    };
    expect(body.repo).toBe('maxscharwath/kroma');
    expect(body.fetchedAt).toBeTruthy();
    expect(body.packages.map((p) => p.channel)).toEqual(['nightly', 'stable']);
    expect(body.packages[1]).toMatchObject({
      version: '1.2.3-3439372',
      link: 'https://dl/kroma-1.2.3-3439372-x86_64.spk',
      release: 'https://github.com/o/r/releases/v1.2.3',
    });
  });

  it('treats a trailing slash as the same route', async () => {
    ghServing([release()]);
    const res = await machine('/catalog.json/');
    expect(res.status).toBe(200);
    expect(await packagesOf(res)).toHaveLength(1);
  });

  it('falls through to the rendered site for anything that is not a feed', async () => {
    const calls = ghServing([release()]);
    expect(await machineResponse(req('/browse'), {}, ctx())).toBeNull();
    expect(await machineResponse(req('/assets/app-abc123.js'), {}, ctx())).toBeNull();
    expect(calls).toEqual([]);
  });

  it('degrades to an empty package list with a 503 when GitHub is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    offline('offline');
    const res = await machine('/catalog.json');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ packages: [], error: 'catalog unavailable' });
  });

  it('does not disclose the upstream failure to the caller', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    offline('connect ECONNREFUSED 10.0.0.7:443 fetching api.github.com');
    const raw = await (await machine('/catalog.json')).text();
    expect(raw).not.toContain('api.github.com');
    expect(raw).not.toContain('ECONNREFUSED');
    expect(raw).not.toContain('10.0.0.7');
    expect(logged).toHaveBeenCalled();
  });
});

describe('the DSM feed at the root', () => {
  it('sends a browser to /browse but answers a DSM probe with JSON', async () => {
    ghServing([release()]);
    const browser = await machine('/', { headers: { accept: 'text/html' } });
    expect(browser.status).toBe(302);
    expect(browser.headers.get('location')).toBe('https://packages.kroma.tv/browse');

    for (const query of ['?arch=x86_64', '?unique=synology_x86_64_920%2B']) {
      const probe = await machine(`/${query}`, { headers: { accept: 'text/html' } });
      expect(probe.status).toBe(200);
      expect(probe.headers.get('content-type')).toContain('application/json');
      expect(await packagesOf(probe)).toHaveLength(1);
    }
  });

  it('reads the arch and channel off an urlencoded POST body', async () => {
    ghServing([release()]);
    const res = await machine('/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'arch=apollolake&major=7&package_update_channel=stable',
    });
    expect((await packagesOf(res))[0]?.version).toBe('1.2.3-3439372');
  });

  it('offers nothing to an arch the package was never built for', async () => {
    ghServing([release()]);
    const res = await machine('/', { method: 'POST', body: 'arch=armada38x&major=7' });
    expect(await res.json()).toEqual({ packages: [] });
  });

  it('offers nothing below DSM 7, and stays permissive when major is unreadable', async () => {
    ghServing([release()]);
    const six = await machine('/', { method: 'POST', body: 'arch=x86_64&major=6' });
    expect(await packagesOf(six)).toEqual([]);

    const blank = await machine('/', { method: 'POST', body: 'arch=x86_64&major=' });
    expect(await packagesOf(blank)).toHaveLength(1);
  });

  it('prefers the nightly for a beta subscriber only when it is ahead of stable', async () => {
    ghServing([release(), NIGHTLY]);
    const beta = await machine('/', {
      method: 'POST',
      body: 'arch=x86_64&package_update_channel=beta',
    });
    expect((await packagesOf(beta))[0]?.version).toBe('1.3.0-9000001');

    const stable = await machine('/', {
      method: 'POST',
      body: 'arch=x86_64&package_update_channel=stable',
    });
    expect((await packagesOf(stable))[0]?.version).toBe('1.2.3-3439372');
  });

  it('falls back to stable for a beta subscriber when the nightly is behind', async () => {
    ghServing([
      release(),
      release({
        tag_name: 'nightly',
        prerelease: true,
        assets: [asset('kroma-0.0.9-1-x86_64.spk')],
      }),
    ]);
    const res = await machine('/', {
      method: 'POST',
      body: 'arch=x86_64&package_update_channel=beta',
    });
    expect((await packagesOf(res))[0]?.version).toBe('1.2.3-3439372');
  });

  it('offers nothing at all when no release carries a package', async () => {
    ghServing([release({ tag_name: 'desktop-latest', assets: [asset('KROMA.dmg')] })]);
    const res = await machine('/', { method: 'POST', body: 'arch=x86_64&major=7' });
    expect(await res.json()).toEqual({ packages: [] });
  });

  it('answers an unreadable POST body as if it were empty rather than failing', async () => {
    ghServing([release()]);
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    const res = await machine('/', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(await packagesOf(res)).toHaveLength(1);
  });
});

describe('/icon.png', () => {
  it('proxies the icon of the configured repo and lets DSM cache it for an hour', async () => {
    const calls = fetchServing('PNGBYTES');
    const res = await machine('/icon.png', undefined, { GITHUB_REPO: 'someone/fork' });
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await res.text()).toBe('PNGBYTES');
    expect(calls[0]).toBe(
      'https://raw.githubusercontent.com/someone/fork/main/clients/synology/spk/PACKAGE_ICON_256.PNG',
    );
  });

  it('404s rather than serving an error body as an image', async () => {
    fetchServing('not found', 404);
    const res = await machine('/icon.png');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('icon unavailable');
  });

  it('serves the edge copy, and ?fresh skips that read and busts the subrequest', async () => {
    const { cache } = stubEdgeCache({ [ICON_SRC]: 'OLD' });
    const calls = fetchServing('NEW');

    expect(await (await machine('/icon.png')).text()).toBe('OLD');
    expect(calls).toEqual([]);

    const fresh = await machine('/icon.png?fresh=1');
    expect(await fresh.text()).toBe('NEW');
    expect(calls[0]).toContain('?cb=');
    expect(cache.put).toHaveBeenCalled();
  });
});
