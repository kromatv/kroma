import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogForRequest, catalogPayload } from './get-catalog';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://modules.kroma.tv/module/tv.kroma.vpn?tab=history'),
}));

const ICON = `data:image/svg+xml;base64,${btoa('<svg viewBox="0 0 24 24" />')}`;

const CATALOG = {
  schema: 2,
  generatedAt: '2026-07-02T00:00:00Z',
  modules: [
    {
      id: 'tv.kroma.vpn',
      name: 'VPN',
      version: '1.2.0',
      icon: ICON,
      url: 'https://dl.test/vpn.kmod',
      sha256: 'a'.repeat(64),
    },
  ],
};

function upstream(body: string) {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body)),
  );
}

function offline() {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline');
    }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('catalogPayload', () => {
  it('hands out the origin as the registry url, not a document under it', async () => {
    upstream(JSON.stringify(CATALOG));
    const payload = await catalogPayload('https://modules.kroma.tv');
    // What an operator pastes names the REGISTRY; the server resolves the
    // descriptor at its well-known path from there.
    expect(payload.registry).toBe('https://modules.kroma.tv');
    expect(payload.generatedAt).toBe('2026-07-02T00:00:00Z');
  });

  it('hands the icon out as a versioned url, never as the data uri the catalog carries', async () => {
    upstream(JSON.stringify(CATALOG));
    const { modules } = await catalogPayload('https://modules.kroma.tv');
    expect(modules.map((m) => [m.id, m.icon])).toEqual([
      ['tv.kroma.vpn', '/icon/tv.kroma.vpn/1.2.0.svg'],
    ]);
  });

  it('reports no generation date when the catalog carries none', async () => {
    upstream(JSON.stringify({ schema: 2, modules: [] }));
    const payload = await catalogPayload('https://modules.kroma.tv');
    expect(payload.generatedAt).toBeNull();
    expect(payload.modules).toEqual([]);
  });

  it('still names the registry when nothing upstream can produce a catalog', async () => {
    offline();
    expect(await catalogPayload('https://modules.kroma.tv')).toEqual({
      registry: 'https://modules.kroma.tv',
      modules: [],
      generatedAt: null,
    });
  });

  it('degrades the same way when the body upstream served is not a catalog', async () => {
    upstream('<!doctype html><title>404</title>');
    expect(await catalogPayload('https://modules.kroma.tv')).toEqual({
      registry: 'https://modules.kroma.tv',
      modules: [],
      generatedAt: null,
    });
  });
});

describe('catalogForRequest', () => {
  it('names the registry on the origin the page was reached at, path and query dropped', async () => {
    upstream(JSON.stringify(CATALOG));
    const payload = await catalogForRequest();
    expect(payload.registry).toBe('https://modules.kroma.tv');
    expect(payload.modules.map((m) => m.id)).toEqual(['tv.kroma.vpn']);
  });
});
