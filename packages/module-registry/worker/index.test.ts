import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REPO } from './config';
import worker, { type Env } from './index';

const ctx = () => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
});
const req = (path: string, init?: RequestInit) =>
  new Request(`https://modules.kroma.tv${path}`, init);

const TEMPLATE =
  '<!doctype html><html><head><link rel="kroma-modules" href="/modules.json" />' +
  '<script id="kroma-catalog" type="application/json">"__CATALOG__"</script></head>' +
  '<body><div id="root"></div></body></html>';

const assets = (body = TEMPLATE, status = 200): Env['ASSETS'] => ({
  fetch: async () => new Response(body, { status }),
});

const CATALOG = {
  schema: 2,
  generatedAt: '2026-07-02T00:00:00Z',
  modules: [
    {
      id: 'tv.kroma.demo',
      name: 'Demo & Co',
      version: '1.0.0',
      description: 'A <demo> module',
      minServer: '0.1.0',
      dependsOn: { 'tv.kroma.base': '^1.0.0' },
      icon: 'https://cdn/icon.png',
      size: 3145728,
      artifacts: [{ target: 'wasm32', url: 'https://dl/a.kmod', size: 1, sha256: 'x' }],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
}

describe('module-registry worker', () => {
  it('answers /ping without any network', async () => {
    const res = await worker.fetch(req('/ping'), {}, ctx());
    expect(await res.text()).toBe('pong');
  });

  it('serves the catalog JSON at /modules.json', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(req('/modules.json'), {}, ctx());
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(CATALOG);
  });

  it('aliases /all.json to the same catalog', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(req('/all.json'), {}, ctx());
    expect(await res.json()).toEqual(CATALOG);
  });

  it('strips a trailing slash so /modules.json/ still matches', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(req('/modules.json/'), {}, ctx());
    expect(await res.json()).toEqual(CATALOG);
  });

  it('injects the catalog into the built page for a browser', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(
      req('/', { headers: { accept: 'text/html' } }),
      { ASSETS: assets() },
      ctx(),
    );
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).not.toContain('__CATALOG__');
    expect(html).toContain('"tv.kroma.demo"');
    expect(html).toContain('rel="kroma-modules"');
  });

  // The catalog lands inside a <script> tag, and its text is third-party: a
  // description carrying `</script>` must not break out of the tag.
  it('escapes catalog text against script breakout before injecting', async () => {
    stubFetchOk({
      schema: 2,
      modules: [{ id: 'x', name: 'x', version: '1', description: '</script><script>boom' }],
    });
    const res = await worker.fetch(
      req('/', { headers: { accept: 'text/html' } }),
      { ASSETS: assets() },
      ctx(),
    );
    const html = await res.text();
    expect(html).not.toContain('</script><script>boom');
    expect(html).toContain('\\u003c/script>');
  });

  it('falls back to a minimal discoverable page without built assets', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(req('/', { headers: { accept: 'text/html' } }), {}, ctx());
    const html = await res.text();
    expect(html).toContain('rel="kroma-modules"');
    expect(html).toContain('https://modules.kroma.tv/modules.json');
  });

  it('passes hashed site assets through untouched', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(
      req('/assets/app-abc123.js'),
      { ASSETS: assets('console.log(1)') },
      ctx(),
    );
    expect(await res.text()).toBe('console.log(1)');
  });

  it('returns the raw catalog JSON to a non-browser client at /', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(req('/'), {}, ctx());
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(CATALOG);
  });

  it('degrades to an empty catalog when GitHub is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const res = await worker.fetch(req('/modules.json'), {}, ctx());
    const body = (await res.json()) as { schema: number; modules: unknown[]; error: string };
    expect(body.schema).toBe(2);
    expect(body.modules).toEqual([]);
    expect(body.error).toBe('catalog unavailable');
  });

  // Public and unauthenticated: `String(err)` on a failed fetch would leak
  // the upstream URL and whatever a thrown message happens to carry.
  it('does not disclose the upstream failure to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.7:443 while fetching secret-host');
      }),
    );
    const res = await worker.fetch(req('/modules.json'), {}, ctx());
    const raw = await res.text();
    expect(raw).not.toContain('ECONNREFUSED');
    expect(raw).not.toContain('secret-host');
    expect(raw).not.toContain('10.0.0.7');
  });

  it('degrades the same way on a non-OK upstream status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    const res = await worker.fetch(req('/modules.json'), {}, ctx());
    const body = (await res.json()) as { modules: unknown[]; error: string };
    expect(body.modules).toEqual([]);
    expect(body.error).toBe('catalog unavailable');
  });

  it('exports the default repo', () => {
    expect(DEFAULT_REPO).toBe('maxscharwath/kroma');
  });

  // Without this, an unmatched path would fall through to the JSON catch-all,
  // so /favicon.ico would answer 200 application/json and browsers would keep
  // showing whatever icon they had cached.
  it('serves the brand mark at /favicon.svg and /favicon.ico, not the catalog', async () => {
    for (const p of ['/favicon.svg', '/favicon.ico']) {
      const res = await worker.fetch(req(p), {}, ctx());
      expect(res.headers.get('content-type')).toBe('image/svg+xml');
      const body = await res.text();
      expect(body).toContain('aria-label="KROMA"');
      expect(body).not.toContain('"schema"');
    }
  });

  // The REAL template must carry what the worker and the server rely on: the
  // injection placeholder and the autodiscovery tag.
  it('ships the placeholder and discovery link in the site template', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    expect(html).toContain('__CATALOG__');
    expect(html).toContain('rel="kroma-modules"');
  });
});
