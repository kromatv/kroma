import { describe, expect, it } from 'vitest';
import { buildDescriptor, buildIndex, buildModuleRecord, sriFromHex } from './build.ts';
import { ModuleRecord, RegistryDescriptor, RegistryIndex } from './documents/index.ts';
import type { DescribedModule } from './manifest/index.ts';

function entry(over: Partial<DescribedModule> = {}): DescribedModule {
  return {
    id: 'tv.kroma.torrents',
    name: 'Torrents',
    version: '0.1.7',
    description: 'Torrent stuff',
    engines: { server: '>=0.1.4' },
    icon: 'data:image/svg+xml,…',
    contributes: [{ point: 'tv.kroma.torrents/download-client', id: 'builtin' }],
    artifacts: [
      {
        file: 'x.kmod',
        url: 'https://h/x.kmod',
        size: 10,
        sha256: 'ab'.repeat(32),
        contentHash: 'cd'.repeat(32),
      },
    ],
    file: 'x.kmod',
    url: 'https://h/x.kmod',
    size: 10,
    sha256: 'ab'.repeat(32),
    ...over,
  } as DescribedModule;
}

describe('sriFromHex', () => {
  it('encodes a hex digest as sha256-<base64>', () => {
    expect(sriFromHex('00'.repeat(32))).toBe(`sha256-${'A'.repeat(43)}=`);
  });

  it('refuses anything that is not a 64-char hex digest', () => {
    expect(sriFromHex('deadbeef')).toBeNull();
    expect(sriFromHex(undefined)).toBeNull();
  });
});

describe('buildModuleRecord', () => {
  it('emits a document the schema accepts', () => {
    expect(() => ModuleRecord.parse(buildModuleRecord(entry()))).not.toThrow();
  });

  it('carries the contract the bundle was built against, so a client can judge it', () => {
    // Without this on the wire, every compatibility check downstream has to
    // download the bundle to find out it cannot install it.
    const record = buildModuleRecord(entry({ schemaVersion: 2 }));
    expect(record.versions['0.1.7']?.schemaVersion).toBe(2);
    expect(buildIndex([entry({ schemaVersion: 2 })])[0]?.schemaVersion).toBe(2);
  });

  it('carries the store metadata and one version with SRI artifacts', () => {
    const record = buildModuleRecord(
      entry({ author: 'Max', license: 'AGPL-3.0-or-later', keywords: ['torrent'] }),
    );
    expect(record).toMatchObject({
      apiVersion: 1,
      id: 'tv.kroma.torrents',
      author: 'Max',
      license: 'AGPL-3.0-or-later',
      keywords: ['torrent'],
      latest: '0.1.7',
    });
    const version = record.versions['0.1.7'];
    expect(version?.engines).toEqual({ server: '>=0.1.4' });
    expect(version?.artifacts[0]?.integrity).toBe(sriFromHex('ab'.repeat(32)));
  });

  it('derives tags from the points it answers when none are explicit', () => {
    expect(buildModuleRecord(entry()).tags).toEqual(['download-client']);
  });

  it('prefers explicit tags over derived ones', () => {
    expect(buildModuleRecord(entry({ tags: ['featured'] })).tags).toEqual(['featured']);
  });

  it('tags a stable version as latest and a pre-release by its channel', () => {
    expect(buildModuleRecord(entry()).distTags).toEqual({ latest: '0.1.7' });
    expect(buildModuleRecord(entry({ version: '0.2.0-beta.3' })).distTags).toEqual({
      beta: '0.2.0-beta.3',
    });
  });

  it('gives a pre-release with no named channel no dist-tag at all', () => {
    expect(buildModuleRecord(entry({ version: '0.2.0-1' })).distTags).toEqual({});
  });

  it('folds a new version into what the registry already publishes', () => {
    const published = buildModuleRecord(entry());
    const next = buildModuleRecord(entry({ version: '0.2.0' }), published);
    expect(Object.keys(next.versions).sort()).toEqual(['0.1.7', '0.2.0']);
    expect(next.distTags.latest).toBe('0.2.0');
    expect(next.latest).toBe('0.2.0');
  });

  it('keeps the stable release as `latest` when a beta is published after it', () => {
    const stable = buildModuleRecord(entry());
    const beta = buildModuleRecord(entry({ version: '0.2.0-beta.1' }), stable);
    expect(beta.distTags).toEqual({ latest: '0.1.7', beta: '0.2.0-beta.1' });
    expect(beta.latest).toBe('0.1.7');
  });

  it('carries both dependency maps into the version record', () => {
    const record = buildModuleRecord(
      entry({
        dependencies: { 'tv.kroma.x': '^0.1.0' },
        optionalDependencies: { 'tv.kroma.y': '*' },
      }),
    );
    expect(record.versions['0.1.7']?.dependencies).toEqual({ 'tv.kroma.x': '^0.1.0' });
    expect(record.versions['0.1.7']?.optionalDependencies).toEqual({ 'tv.kroma.y': '*' });
  });

  it('omits an empty dependency map rather than emitting {}', () => {
    expect(buildModuleRecord(entry()).versions['0.1.7']?.dependencies).toBeUndefined();
  });

  it('describes the one bundle of a component without naming a platform', () => {
    const [artifact] = buildModuleRecord(entry()).versions['0.1.7']?.artifacts ?? [];

    expect(artifact).toEqual({
      url: 'https://h/x.kmod',
      size: 10,
      integrity: sriFromHex('ab'.repeat(32)),
      contentHash: sriFromHex('cd'.repeat(32)),
    });
  });

  it('passes on the platform a per-platform build names, which a released server picks by', () => {
    const native = { ...entry().artifacts[0], target: 'x86_64-unknown-linux-musl' };

    const record = buildModuleRecord(
      entry({ artifacts: [native] as DescribedModule['artifacts'] }),
    );

    expect(record.versions['0.1.7']?.artifacts[0]?.target).toBe('x86_64-unknown-linux-musl');
  });

  it('drops an artifact with no usable checksum instead of describing it', () => {
    const record = buildModuleRecord(
      entry({
        artifacts: [{ ...entry().artifacts[0], sha256: '' }] as DescribedModule['artifacts'],
      }),
    );
    expect(record.versions['0.1.7']?.artifacts).toEqual([]);
  });
});

describe('buildDescriptor / buildIndex', () => {
  const modules = [entry({ id: 'tv.kroma.b' }), entry({ id: 'tv.kroma.a' })];

  it('descriptor lists sorted ids with the api version', () => {
    expect(RegistryDescriptor.parse(buildDescriptor('KROMA', 'https://r', modules))).toEqual({
      apiVersion: 1,
      name: 'KROMA',
      url: 'https://r',
      modules: ['tv.kroma.a', 'tv.kroma.b'],
    });
  });

  it('index carries the installable version of every module, sorted by id', () => {
    const index = RegistryIndex.parse(buildIndex(modules));
    expect(index.map((e) => e.id)).toEqual(['tv.kroma.a', 'tv.kroma.b']);
    expect(index[0]?.version).toBe('0.1.7');
    expect(index[0]?.artifacts[0]?.integrity).toBe(sriFromHex('ab'.repeat(32)));
    expect(index[0]).not.toHaveProperty('versions');
  });
});

describe('permissions', () => {
  const permissions = { net: { connect: [{ purpose: 'indexer', to: ['public'] }] } };

  it('a catalog entry carries what its version may do', () => {
    const [row] = buildIndex([entry({ permissions })]);

    expect(row?.permissions).toEqual(permissions);
    expect(RegistryIndex.parse([row])[0]?.permissions?.net?.connect?.[0]?.purpose).toBe('indexer');
  });

  it('a module that declares nothing has no permissions in its entry', () => {
    const [row] = buildIndex([entry()]);

    expect(row?.permissions).toBeUndefined();
  });

  it('a module record carries them per version', () => {
    const record = buildModuleRecord(entry({ permissions }));

    expect(record.versions['0.1.7']?.permissions).toEqual(permissions);
  });
});

describe('what a version reaches', () => {
  const storage = { core: { read: ['users.email', 'requests'], write: ['requests'] } };
  const settings = { read: ['namingCase'], write: ['namingCase'] };
  const rqbit = { assets: { 'linux-x86_64': { url: 'https://h/rqbit', sha256: 'ab'.repeat(32) } } };

  it('a catalog entry carries the storage, settings and helpers its manifest declares', () => {
    const declared = entry({
      storage,
      settings,
      helpers: { rqbit },
      permissions: { run: ['rqbit', 'curl'] },
    });

    const [row] = RegistryIndex.parse(buildIndex([declared]));

    expect(row?.storage).toEqual(storage);
    expect(row?.settings).toEqual(settings);
    expect(row?.helpers).toEqual({ rqbit });
  });

  it('a module that runs only programs of the server says it pins none', () => {
    const [row] = buildIndex([entry({ permissions: { run: ['ffmpeg'] } })]);

    expect(row?.helpers).toEqual({});
  });

  it('a module that reaches nothing carries none of them', () => {
    const [row] = buildIndex([entry()]);

    expect(row?.storage).toBeUndefined();
    expect(row?.settings).toBeUndefined();
    expect(row?.helpers).toBeUndefined();
  });

  it('an entry from a catalog that predates them still parses', () => {
    const [row] = buildIndex([entry({ permissions: { fs: { read: ['media'] } } })]);
    const { storage: _s, settings: _t, helpers: _h, ...older } = row ?? {};

    const [parsed] = RegistryIndex.parse([older]);

    expect(parsed?.permissions).toEqual({ fs: { read: ['media'] } });
    expect(parsed?.storage).toBeUndefined();
    expect(parsed?.settings).toBeUndefined();
  });

  it('a module record carries them per version', () => {
    const record = buildModuleRecord(entry({ storage, settings }));

    expect(record.versions['0.1.7']?.storage).toEqual(storage);
    expect(record.versions['0.1.7']?.settings).toEqual(settings);
  });
});
