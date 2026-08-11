import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import server from './server';

const rendered = vi.hoisted(() => [] as string[]);

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: {
    fetch: (request: Request) => {
      rendered.push(new URL(request.url).pathname);
      return new Response('<html lang="fr"><head></head><body>modules</body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  },
}));

const ctx = () => ({ waitUntil: vi.fn() });

const req = (path: string, init?: RequestInit) =>
  new Request(`https://modules.kroma.tv${path}`, init);

const catalog = {
  schema: 2,
  generatedAt: '2026-07-01T00:00:00Z',
  registry: 'https://modules.kroma.tv/modules.json',
  modules: [{ id: 'tv.kroma.torrents', name: 'Torrents', version: '0.1.0', artifacts: [] }],
};

function ghServing() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(catalog), { status: 200 });
    }),
  );
  return calls;
}

beforeEach(() => {
  rendered.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the worker entry', () => {
  it('answers a machine route itself, without reaching for the catalog', async () => {
    const calls = ghServing();
    const res = await server.fetch(req('/ping'), {}, ctx());

    expect(await res.text()).toBe('pong');
    expect(calls).toEqual([]);
    expect(rendered).toEqual([]);
  });

  it('threads its env through to the catalog it serves', async () => {
    const calls = ghServing();
    const res = await server.fetch(req('/modules.json'), { GITHUB_REPO: 'someone/fork' }, ctx());
    const body = (await res.json()) as { modules: { id: string }[] };

    expect(body.modules[0]?.id).toBe('tv.kroma.torrents');
    expect(calls[0]).toContain('someone/fork');
  });

  it('serves the mark without asking GitHub for anything', async () => {
    const calls = ghServing();
    const res = await server.fetch(req('/favicon.svg'), {}, ctx());

    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(await res.text()).toContain('<svg');
    expect(calls).toEqual([]);
  });

  it('renders a page route with the ground stamped and the kit stylesheet inlined', async () => {
    ghServing();
    const res = await server.fetch(
      req('/', { headers: { accept: 'text/html', cookie: 'kroma-theme=light' } }),
      {},
      ctx(),
    );
    const html = await res.text();

    expect(rendered).toEqual(['/']);
    expect(html).toContain('<html data-theme="light" lang="fr">');
    expect(html).toContain('<style id="react-native-stylesheet">');
  });
});
