// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ModuleAccess, PermissionSource } from '#web/features/admin/module-permissions';
import { consentOverview, extendedSentence } from '#web/features/admin/module-permissions-overview';
import { englishT } from '#web/features/admin/module-permissions.fixture';

const t = englishT();

const TORRENTS: PermissionSource = {
  permissions: {
    run: ['rqbit', 'curl'],
    net: { host: true, connect: [{ purpose: 'peers', to: ['public'] }] },
    fs: { read: ['downloads', 'media'], write: ['downloads'] },
  },
  storage: { core: { read: ['users.email'], write: ['downloads'] } },
  official: true,
};

const ACQUISITION: PermissionSource = {
  permissions: {
    net: { connect: [{ purpose: 'metadata', to: ['api.themoviedb.org'] }] },
    fs: { read: ['downloads', 'media'], write: ['downloads', 'media'] },
  },
  storage: { core: { read: ['users.email', 'users.username'], write: ['requests'] } },
  official: true,
};

const INDEXERS: PermissionSource = {
  permissions: { net: { connect: [{ purpose: 'indexer', to: ['public', 'lan'] }] } },
  official: true,
};

const VPN: PermissionSource = {
  permissions: {
    run: ['wireproxy'],
    net: { host: true, connect: [{ purpose: 'tunnel', to: ['public'] }] },
  },
  official: true,
};

const modules = (...sources: [string, PermissionSource | null][]): ModuleAccess[] =>
  sources.map(([name, source]) => ({ id: name.toLowerCase(), name, source }));

describe('extendedSentence', () => {
  it('names the programs and the direct connection in one sentence', () => {
    expect(extendedSentence(TORRENTS, t)).toBe(
      "Starts rqbit and curl on your server and uses its direct connection, outside the module's isolation.",
    );
  });

  it('starts from the server when the module starts no program', () => {
    const direct: PermissionSource = { permissions: { net: { host: true } }, official: true };

    expect(extendedSentence(direct, t)).toBe(
      "Uses your server's direct connection, outside the module's isolation.",
    );
  });

  it('says nothing for a module that stays inside its isolation, downloads included', () => {
    expect([extendedSentence(INDEXERS, t), extendedSentence(ACQUISITION, t)]).toEqual([null, null]);
  });
});

describe('consentOverview', () => {
  it('says each kind of access once, with the modules that share it', () => {
    const { shared } = consentOverview(
      modules(['Acquisition', ACQUISITION], ['Torrents', TORRENTS], ['Indexers', INDEXERS]),
      t,
    );

    expect(shared).toEqual([
      {
        category: 'accounts',
        access: 'read',
        brief: 'Email address and 1 other',
        modules: ['Acquisition', 'Torrents'],
      },
      {
        category: 'files',
        access: 'write',
        brief: 'Library and downloads',
        modules: ['Acquisition', 'Torrents'],
      },
      {
        category: 'internet',
        access: null,
        brief: 'Any website',
        modules: ['Acquisition', 'Torrents', 'Indexers'],
      },
    ]);
  });

  it('gives one line to each module that reaches past its isolation', () => {
    const { extended } = consentOverview(
      modules(['Indexers', INDEXERS], ['Torrents', TORRENTS], ['VPN', VPN]),
      t,
    );

    expect(extended).toEqual([
      {
        id: 'torrents',
        line: 'Torrents starts rqbit and curl on your server and uses its direct connection',
      },
      { id: 'vpn', line: 'VPN starts wireproxy on your server and uses its direct connection' },
    ]);
  });

  it('leaves a module that does not say what it does out of every line', () => {
    const { shared, extended } = consentOverview(
      modules(['Indexers', INDEXERS], ['Silent', null]),
      t,
    );

    expect(extended).toEqual([]);
    expect(shared.map((line) => line.modules)).toEqual([['Indexers'], ['Indexers']]);
  });
});
