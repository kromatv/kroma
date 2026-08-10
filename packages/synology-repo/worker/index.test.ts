// The DSM package-repository worker: what Synology's Package Center gets when
// it points at repo.kroma.tv, and what a browser gets when a human pastes the
// same URL.
//
// The routes matter more than they look. DSM asks for JSON with an urlencoded
// POST and no Accept header it means; a browser GETs the identical URL wanting
// HTML. Serving either one the other's answer is how a repository silently
// stops working, and there is no error to read when it does.

import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

type Ctx = { waitUntil: (p: Promise<unknown>) => void };
const ctx = (): Ctx => ({ waitUntil: vi.fn() });
const req = (path: string, init?: RequestInit) => new Request(`https://repo.kroma.tv${path}`, init);

const spkAsset = (name: string) => ({
  name,
  browser_download_url: `https://dl/${name}`,
  size: 1024,
});

// One published release carrying a .spk, which is all a catalog entry is.
const RELEASES = [
  {
    draft: false,
    prerelease: false,
    tag_name: 'v1.2.3',
    name: 'v1.2.3',
    published_at: '2026-07-01T00:00:00Z',
    html_url: 'https://github.com/o/r/releases/v1.2.3',
    assets: [spkAsset('kroma-1.2.3-3439372-x86_64.spk')],
  },
];

const NIGHTLY = {
  draft: false,
  prerelease: true,
  tag_name: 'nightly',
  name: 'nightly',
  published_at: '2026-07-02T00:00:00Z',
  html_url: 'https://github.com/o/r/releases/nightly',
  assets: [spkAsset('kroma-1.3.0-9000001-x86_64.spk')],
};

// GitHub answers the releases API; every other fetch (the .info.json sidecar,
// the icon) 404s, which the catalog treats as "no extra detail".
function githubServing(releases: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // Match on the HOST, not on a substring of the URL: `includes` would
      // also accept https://api.github.com.evil.test/ and, in a stub that
      // stands in for the real API, a sloppy match teaches a sloppy shape.
      const { hostname } = new URL(String(input));
      if (hostname === 'api.github.com') {
        return new Response(JSON.stringify(releases), { status: 200 });
      }
      return new Response('', { status: 404 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synology repo worker', () => {
  it('answers /ping without touching GitHub', async () => {
    const res = await worker.fetch(req('/ping'), {}, ctx());
    expect(await res.text()).toBe('pong');
  });

  // Without this, /favicon.ico falls through to the JSON catch-all, and a
  // browser caches that JSON body as the tab icon.
  it('serves the brand mark at /favicon.svg and /favicon.ico, never the catalog', async () => {
    for (const path of ['/favicon.svg', '/favicon.ico']) {
      const res = await worker.fetch(req(path), {}, ctx());
      expect(res.headers.get('content-type')).toBe('image/svg+xml');
      expect(await res.text()).toContain('aria-label="KROMA"');
    }
  });

  it('offers the stable release as a DSM package', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/catalog.json'), {}, ctx());
    const body = (await res.json()) as { packages: { version: string }[] };
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0]?.version).toBe('1.2.3-3439372');
  });

  it('lists every channel on /all.json', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/all.json'), {}, ctx());
    const body = (await res.json()) as { repo: string; packages: { channel: string }[] };
    expect(body.repo).toBeTruthy();
    expect(body.packages.map((p) => p.channel)).toContain('stable');
  });

  it('renders the landing page as HTML for a human', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/browse'), {}, ctx());
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<');
  });

  it('degrades to an empty package list when GitHub is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const res = await worker.fetch(req('/catalog.json'), {}, ctx());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { packages: unknown[]; error: string };
    expect(body.packages).toEqual([]);
    expect(body.error).toBe('catalog unavailable');
  });

  // This endpoint is public and unauthenticated: `String(err)` on a failed fetch
  // names the upstream URL and repeats whatever a thrown message carries.
  it('does not disclose the upstream failure to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.7:443 fetching secret-host');
      }),
    );
    const res = await worker.fetch(req('/catalog.json'), {}, ctx());
    const raw = await res.text();
    expect(raw).not.toContain('ECONNREFUSED');
    expect(raw).not.toContain('secret-host');
    expect(raw).not.toContain('10.0.0.7');
  });

  it('treats a trailing slash as the same route', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/catalog.json/'), {}, ctx());
    expect(res.status).toBe(200);
  });

  it('answers /nightly.json with the nightly entry, and /catalog.json with neither', async () => {
    githubServing([NIGHTLY]);
    const nightly = (await (await worker.fetch(req('/nightly.json'), {}, ctx())).json()) as {
      packages: { version: string }[];
    };
    expect(nightly.packages[0]?.version).toBe('1.3.0-9000001');

    const stable = (await (await worker.fetch(req('/catalog.json'), {}, ctx())).json()) as {
      packages: unknown[];
    };
    expect(stable.packages).toEqual([]);
  });
});

describe('the DSM feed at the root', () => {
  it('reads the arch and channel off an urlencoded POST body', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(
      req('/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'arch=apollolake&major=7&package_update_channel=stable',
      }),
      {},
      ctx(),
    );
    const body = (await res.json()) as { packages: { version: string }[] };
    expect(body.packages[0]?.version).toBe('1.2.3-3439372');
  });

  it('offers nothing to an arch the package was never built for', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(
      req('/', { method: 'POST', body: 'arch=armada38x&major=7' }),
      {},
      ctx(),
    );
    expect(await res.json()).toEqual({ packages: [] });
  });

  it('offers nothing below DSM 7, and stays permissive when major is unreadable', async () => {
    githubServing(RELEASES);
    const six = await worker.fetch(
      req('/', { method: 'POST', body: 'arch=x86_64&major=6' }),
      {},
      ctx(),
    );
    expect(await six.json()).toEqual({ packages: [] });

    const unknown = await worker.fetch(
      req('/', { method: 'POST', body: 'arch=x86_64&major=' }),
      {},
      ctx(),
    );
    expect(((await unknown.json()) as { packages: unknown[] }).packages).toHaveLength(1);
  });

  it('prefers the nightly for a beta subscriber only when it is ahead of stable', async () => {
    githubServing([...RELEASES, NIGHTLY]);
    const beta = await worker.fetch(
      req('/', { method: 'POST', body: 'arch=x86_64&package_update_channel=beta' }),
      {},
      ctx(),
    );
    expect(((await beta.json()) as { packages: { version: string }[] }).packages[0]?.version).toBe(
      '1.3.0-9000001',
    );

    const stable = await worker.fetch(
      req('/', { method: 'POST', body: 'arch=x86_64&package_update_channel=stable' }),
      {},
      ctx(),
    );
    expect(
      ((await stable.json()) as { packages: { version: string }[] }).packages[0]?.version,
    ).toBe('1.2.3-3439372');
  });

  it('falls back to stable for a beta subscriber when the nightly is behind', async () => {
    githubServing([...RELEASES, { ...NIGHTLY, assets: [spkAsset('kroma-0.0.9-1-x86_64.spk')] }]);
    const res = await worker.fetch(
      req('/', { method: 'POST', body: 'arch=x86_64&package_update_channel=beta' }),
      {},
      ctx(),
    );
    expect(((await res.json()) as { packages: { version: string }[] }).packages[0]?.version).toBe(
      '1.2.3-3439372',
    );
  });

  it('answers an empty POST body rather than failing when the body cannot be read', async () => {
    githubServing(RELEASES);
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    const res = await worker.fetch(
      new Request('https://repo.kroma.tv/', {
        method: 'POST',
        body,
        duplex: 'half',
      } as RequestInit),
      {},
      ctx(),
    );
    expect(((await res.json()) as { packages: unknown[] }).packages).toHaveLength(1);
  });

  it('sends a browser to the landing page but answers DSM’s probe with JSON', async () => {
    githubServing(RELEASES);
    const browser = await worker.fetch(req('/', { headers: { accept: 'text/html' } }), {}, ctx());
    expect(browser.status).toBe(302);
    expect(browser.headers.get('location')).toBe('https://repo.kroma.tv/browse');

    const probe = await worker.fetch(
      req('/?arch=x86_64', { headers: { accept: 'text/html' } }),
      {},
      ctx(),
    );
    expect(probe.status).toBe(200);
    expect(probe.headers.get('content-type')).toContain('application/json');

    const unique = await worker.fetch(
      req('/?unique=synology_x86_64_920%2B', { headers: { accept: 'text/html' } }),
      {},
      ctx(),
    );
    expect(unique.status).toBe(200);
  });
});

describe('/icon.png', () => {
  it('proxies the repo icon and lets DSM cache it for an hour', async () => {
    githubServing(RELEASES);
    vi.mocked(globalThis.fetch).mockImplementation(
      async () => new Response('PNGBYTES', { status: 200 }),
    );
    const res = await worker.fetch(req('/icon.png'), {}, ctx());
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await res.text()).toBe('PNGBYTES');
  });

  it('404s rather than serving an error body as an image', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/icon.png'), {}, ctx());
    expect(res.status).toBe(404);
  });

  it('serves the edge copy, and ?fresh=1 skips that read and busts the subrequest', async () => {
    const cached = new Response('OLD', { headers: { 'content-type': 'image/png' } });
    const cache = {
      match: vi.fn(async () => cached),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal('caches', { default: cache });
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        fetched.push(String(input));
        return new Response('NEW', { status: 200 });
      }),
    );

    expect(await (await worker.fetch(req('/icon.png'), {}, ctx())).text()).toBe('OLD');
    expect(fetched).toEqual([]);

    const fresh = await worker.fetch(req('/icon.png?fresh=1'), {}, ctx());
    expect(await fresh.text()).toBe('NEW');
    expect(fetched[0]).toContain('?cb=');
    expect(cache.put).toHaveBeenCalled();
  });
});
