// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Catalog, depList, loadCatalog, ModuleEntry } from './catalog';

function injected(json: string) {
  const script = document.createElement('script');
  script.id = 'kroma-catalog';
  script.type = 'application/json';
  script.textContent = json;
  document.body.append(script);
}

afterEach(() => {
  document.getElementById('kroma-catalog')?.remove();
  vi.unstubAllGlobals();
});

describe('ModuleEntry', () => {
  it('needs only an id, and fills the rest so a card never renders undefined', () => {
    expect(ModuleEntry.parse({ id: 'tv.kroma.torrents' })).toMatchObject({
      id: 'tv.kroma.torrents',
      name: '',
      version: '',
    });
  });

  it('rejects an entry with no id rather than showing a nameless card', () => {
    expect(ModuleEntry.safeParse({ name: 'Torrents' }).success).toBe(false);
  });

  it('takes both catalog spellings of a dependency list', () => {
    expect(ModuleEntry.parse({ id: 'a', dependsOn: { 'tv.kroma.vpn': '^1' } }).dependsOn).toEqual({
      'tv.kroma.vpn': '^1',
    });
    expect(ModuleEntry.parse({ id: 'a', dependsOn: ['tv.kroma.vpn'] }).dependsOn).toEqual([
      'tv.kroma.vpn',
    ]);
  });
});

describe('depList', () => {
  it('reads the ids out of either spelling, and out of nothing at all', () => {
    expect(depList(['tv.kroma.vpn'])).toEqual(['tv.kroma.vpn']);
    expect(depList({ 'tv.kroma.vpn': '^1', 'tv.kroma.torrents': '*' })).toEqual([
      'tv.kroma.vpn',
      'tv.kroma.torrents',
    ]);
    expect(depList(null)).toEqual([]);
    expect(depList(undefined)).toEqual([]);
  });
});

describe('Catalog', () => {
  it('defaults to no modules rather than to undefined', () => {
    expect(Catalog.parse({})).toEqual({ modules: [] });
  });
});

describe('loadCatalog', () => {
  it('reads the copy the worker injected at the edge, without a fetch', async () => {
    injected(JSON.stringify({ modules: [{ id: 'tv.kroma.torrents', name: 'Torrents' }] }));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const catalog = await loadCatalog();
    expect(catalog.modules[0]?.name).toBe('Torrents');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls through to the local route when the placeholder is still there', async () => {
    injected('"__CATALOG__"');
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return new Response(JSON.stringify({ modules: [{ id: 'tv.kroma.vpn' }] }), { status: 200 });
      }),
    );
    expect((await loadCatalog()).modules[0]?.id).toBe('tv.kroma.vpn');
    expect(asked).toEqual(['/modules.json']);
  });

  it('tries the live registry when the local route is absent, unreachable or malformed', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        if (asked.length === 1) throw new Error('offline');
        return new Response(JSON.stringify({ modules: [{ id: 'tv.kroma.vpn' }] }), { status: 200 });
      }),
    );
    expect((await loadCatalog()).modules[0]?.id).toBe('tv.kroma.vpn');
    expect(asked).toEqual(['/modules.json', 'https://modules.kroma.tv/modules.json']);
  });

  it('skips a source whose body is not JSON, or not a catalog', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        if (asked.length === 1) return new Response('<!doctype html>', { status: 200 });
        return new Response(JSON.stringify({ modules: [{ id: 'tv.kroma.vpn' }] }), { status: 200 });
      }),
    );
    expect((await loadCatalog()).modules[0]?.id).toBe('tv.kroma.vpn');

    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ modules: 'all of them' }), { status: 200 })),
    );
    await expect(loadCatalog()).rejects.toThrow('no catalog reachable');
  });

  it('skips a source that answers with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    await expect(loadCatalog()).rejects.toThrow('no catalog reachable');
  });
});
