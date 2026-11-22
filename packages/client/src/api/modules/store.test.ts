import { describe, expect, it } from 'vitest';
import { StoreCatalog, StoreModule, StorePlanModule } from './store';

const ENTRY = {
  id: 'tv.kroma.acquisition',
  name: 'Acquisition',
  version: '0.4.1',
  description: '',
  library: false,
  engines: {},
  dependencies: {},
  optionalDependencies: {},
  contributes: [],
  consumes: [],
  updateAvailable: false,
  compatible: false,
  reason: 'requires a future thing',
  source: 'Official',
};

describe('StoreModule', () => {
  it('reads a refusal kind it does not know as no refusal, keeping the reason', () => {
    const entry = { ...ENTRY, refusal: { kind: 'quantum', flux: 3 } };

    const parsed = StoreModule.parse(entry);

    expect(parsed.refusal).toBeNull();
    expect(parsed.reason).toBe('requires a future thing');
  });

  it('keeps a refusal kind it knows', () => {
    const entry = { ...ENTRY, refusal: { kind: 'native' } };

    const parsed = StoreModule.parse(entry);

    expect(parsed.refusal).toEqual({ kind: 'native' });
  });
});

describe('what a catalog row says a module reaches', () => {
  const ROW = {
    id: 'tv.kroma.torrents',
    name: 'Torrents',
    version: '0.6.33',
    requested: true,
    permissions: { run: ['rqbit', 'curl'] },
    storage: { core: { read: ['users.email', 'downloads'], write: ['downloads'] } },
    settings: { read: ['rqbitPort'] },
    helpers: {
      rqbit: { assets: { 'linux-x86_64': { url: 'https://h/rqbit', sha256: 'ab'.repeat(32) } } },
    },
  };

  it('reads the storage, settings and helpers a plan row carries', () => {
    const parsed = StorePlanModule.parse(ROW);

    expect(parsed.storage?.core?.read).toEqual(['users.email', 'downloads']);
    expect(parsed.settings?.read).toEqual(['rqbitPort']);
    expect(Object.keys(parsed.helpers ?? {})).toEqual(['rqbit']);
  });

  it('reads a row from a server that predates them as not saying', () => {
    const { storage: _s, settings: _t, helpers: _h, ...older } = ROW;

    const parsed = StorePlanModule.parse(older);

    expect(parsed.permissions?.run).toEqual(['rqbit', 'curl']);
    expect(parsed.storage).toBeUndefined();
    expect(parsed.settings).toBeUndefined();
    expect(parsed.helpers).toBeUndefined();
  });

  it('drops a part it cannot read and keeps the rest', () => {
    const row = { ...ENTRY, ...ROW, storage: { core: { read: ['users; DROP'] } }, settings: 'all' };

    const parsed = StoreModule.parse(row);

    expect(parsed.storage).toBeNull();
    expect(parsed.settings).toBeNull();
    expect(parsed.permissions?.run).toEqual(['rqbit', 'curl']);
  });
});

describe('words', () => {
  it('keeps the sentence a module is offered by and its words in each language', () => {
    const translations = {
      fr: { name: 'Accès à distance', tagline: 'Regardez loin de chez vous.' },
    };

    const parsed = StoreModule.parse({ ...ENTRY, tagline: 'Watch away from home.', translations });

    expect(parsed.tagline).toBe('Watch away from home.');
    expect(parsed.translations).toEqual(translations);
  });

  it('reads translations it cannot parse as none, keeping the row', () => {
    const parsed = StoreModule.parse({ ...ENTRY, translations: { French: 'oui' } });

    expect(parsed.translations).toBeNull();
    expect(parsed.id).toBe('tv.kroma.acquisition');
  });
});

describe('StoreCatalog', () => {
  const catalog = {
    schema: 2,
    serverVersion: '0.1.40',
    registryUrl: '',
    registries: [],
    modules: [],
  };

  it('keeps the modules the official registry offers the setup, in its order', () => {
    const parsed = StoreCatalog.parse({ ...catalog, setup: ['tv.kroma.remote', 'tv.kroma.mdns'] });

    expect(parsed.setup).toEqual(['tv.kroma.remote', 'tv.kroma.mdns']);
  });

  it('reads a server that predates the offer as offering nothing', () => {
    expect(StoreCatalog.parse(catalog).setup).toEqual([]);
  });
});
