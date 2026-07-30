import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { DEFAULT_REPO } from './index';

type Ctx = { waitUntil: (p: Promise<unknown>) => void };
const ctx = (): Ctx => ({ waitUntil: vi.fn() });
const req = (path: string, init?: RequestInit) =>
  new Request(`https://modules.kroma.tv${path}`, init);

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
      dependsOn: ['tv.kroma.base'],
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

  it('renders an HTML landing page for a browser Accept header', async () => {
    stubFetchOk(CATALOG);
    const res = await worker.fetch(req('/', { headers: { accept: 'text/html' } }), {}, ctx());
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('KROMA modules');
    expect(html).toContain('1 module available');
    expect(html).toContain('needs tv.kroma.base');
    expect(html).toContain('3.0 MB');
    expect(html).toContain('&lt;demo&gt;');
    expect(html).toContain('server ≥ 0.1.0');
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

  // Without this, an unmatched path falls through to the JSON catch-all, so
  // /favicon.ico would answer 200 application/json and browsers would keep
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

  it('puts the brand mark in the landing page head and heading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 })),
    );
    const res = await worker.fetch(req('/', { headers: { accept: 'text/html' } }), {}, ctx());
    const html = await res.text();
    expect(html).toMatch(/rel="icon" href="data:image\/svg\+xml/);
    expect(html).toMatch(/<h1><svg[^>]*aria-label="KROMA"/);
  });
});
