import { describe, expect, it } from 'vitest';
import { Catalog, ModuleEntry, parseCatalog } from './catalog';

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

  it('drops a download url that is not https, and a malformed digest', () => {
    const entry = ModuleEntry.parse({
      id: 'a',
      url: 'http://example.test/a.kmod',
      sha256: 'nope',
    });
    expect(entry.url).toBeNull();
    expect(entry.sha256).toBeNull();
  });
});

describe('Catalog', () => {
  it('defaults to no modules rather than to undefined', () => {
    expect(Catalog.parse({})).toEqual({ modules: [] });
  });
});

describe('parseCatalog', () => {
  it('reads a served catalog body', () => {
    const catalog = parseCatalog('{"modules":[{"id":"tv.kroma.torrents","name":"Torrents"}]}');
    expect(catalog?.modules[0]?.name).toBe('Torrents');
  });

  it('is null for JSON that is not a catalog, rather than a half-parsed one', () => {
    expect(parseCatalog('{"modules":[{"name":"nameless"}]}')).toBeNull();
  });

  it('is null for a body that is not JSON at all', () => {
    expect(parseCatalog('<!doctype html>')).toBeNull();
  });
});
