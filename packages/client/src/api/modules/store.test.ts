import { describe, expect, it } from 'vitest';
import { StoreModule, StorePlanModule } from './store';

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
