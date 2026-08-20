import { describe, expect, it } from 'vitest';
import { dependenciesOf, Manifest, optionalDependenciesOf, speaksCurrentSchema } from './v2.ts';

const base = { id: 'tv.kroma.x', name: 'X', version: '1.0.0' };

describe('Manifest', () => {
  it('reads a manifest with nothing but the required fields', () => {
    expect(Manifest.parse(base)).toMatchObject(base);
  });

  it('refuses one that is missing an identity field', () => {
    expect(() => Manifest.parse({ id: 'tv.kroma.x', name: 'X' })).toThrow();
    expect(() => Manifest.parse({ ...base, version: 1 })).toThrow();
  });

  it('accepts an explicit null wherever a field is optional', () => {
    const parsed = Manifest.parse({ ...base, description: null, keywords: null, tags: null });
    expect(parsed.description).toBeNull();
  });

  it('carries a contribution whole, admin UI metadata included', () => {
    const parsed = Manifest.parse({
      ...base,
      contributes: [
        {
          point: 'tv.kroma.torrents/download-client',
          id: 'qbittorrent',
          label: 'qBittorrent',
          fields: [],
        },
      ],
    });
    // Stripping these would silently break the "add engine" picker.
    expect(parsed.contributes?.[0]).toMatchObject({ label: 'qBittorrent', fields: [] });
  });

  it('refuses a contribution that names no point', () => {
    expect(() => Manifest.parse({ ...base, contributes: [{ id: 'no-point' }] })).toThrow();
  });

  it('refuses a need that names no point', () => {
    expect(() => Manifest.parse({ ...base, consumes: [{ version: '^1' }] })).toThrow();
  });
});

describe('storage', () => {
  it('is absent for a module that declares none, which is most of them', () => {
    // Absent is not the same as empty: it means no database at all, and a
    // sidecar built for it does not link SQLite.
    expect(Manifest.parse(base).storage).toBeUndefined();
  });

  it('reads an empty object as the module’s own file and nothing more', () => {
    const parsed = Manifest.parse({ ...base, storage: {} });
    expect(parsed.storage).toEqual({});
    expect(parsed.storage?.core).toBeUndefined();
  });

  it('keeps the core grant whole, table and column entries alike', () => {
    const parsed = Manifest.parse({
      ...base,
      storage: {
        core: { read: ['requests', 'users.username'], write: ['wanted'] },
        adopt: ['indexers'],
      },
    });
    // Dropping any of this would widen or silently void a module's grant.
    expect(parsed.storage).toEqual({
      core: { read: ['requests', 'users.username'], write: ['wanted'] },
      adopt: ['indexers'],
    });
  });

  it('refuses an entry that is not a table or one of its columns', () => {
    const bad = (read: string[]) => () => Manifest.parse({ ...base, storage: { core: { read } } });
    expect(bad(['users.name.first'])).toThrow();
    expect(bad(['requests; DROP TABLE users'])).toThrow();
    expect(bad(['*'])).toThrow();
    expect(bad([''])).toThrow();
    // ...and an adopted table is a bare name, never a column.
    expect(() => Manifest.parse({ ...base, storage: { adopt: ['users.id'] } })).toThrow();
  });

  it('is additive: a manifest that predates it still parses', () => {
    // Which is why it did not cost a schemaVersion. A reader that does not know
    // the field sees a module with no database, and that is what it had.
    expect(speaksCurrentSchema({ schemaVersion: 2 })).toBe(true);
    expect(Manifest.parse({ ...base, schemaVersion: 2 }).storage).toBeUndefined();
  });
});

describe('the shape a real manifest declares', () => {
  // Every property a manifest may carry. zod STRIPS what it does not declare,
  // so a field missing here is a field the published catalog would lose without
  // anything failing - which is how `ports` went missing once.
  const full = {
    schemaVersion: 2,
    id: 'tv.kroma.torrents',
    name: 'Torrents',
    version: '0.1.8',
    description: 'Downloads',
    engines: { server: '>=0.1.4' },
    library: false,
    dependencies: { 'tv.kroma.indexer': '^0.1.0' },
    optionalDependencies: { 'tv.kroma.vpn': '^0.1.0' },
    definesPoints: [
      { name: 'download-grab', version: 1, methods: ['grab', 'gate-open'] },
      { name: 'download-client', version: 1 },
    ],
    contributes: [
      { point: 'tv.kroma.torrents/download-client', version: 1, id: 'rqbit', label: 'rqbit' },
    ],
    consumes: [{ point: 'tv.kroma.indexer/search', version: '^1' }],
    config: [{ key: 'host', label: 'Host', type: 'string', placeholder: 'localhost' }],
    feRemote: { module: './Module' },
    storage: {
      core: { read: ['downloads', 'requests'], write: ['downloads'] },
      adopt: ['download_clients'],
    },
  };

  it('keeps every one of them', () => {
    expect(Manifest.parse(full)).toEqual(full);
  });

  it('refuses a config field whose type is not one the admin can render', () => {
    expect(() =>
      Manifest.parse({ ...full, config: [{ key: 'k', label: 'K', type: 'colour' }] }),
    ).toThrow();
  });
});

describe('dependenciesOf / optionalDependenciesOf', () => {
  it('reads the map a module declares', () => {
    const m = Manifest.parse({
      ...base,
      dependencies: { 'tv.kroma.y': '^1.0.0' },
      optionalDependencies: { 'tv.kroma.z': '*' },
    });
    expect(dependenciesOf(m)).toEqual({ 'tv.kroma.y': '^1.0.0' });
    expect(optionalDependenciesOf(m)).toEqual({ 'tv.kroma.z': '*' });
  });

  it('reads an absent map as no dependencies', () => {
    expect(dependenciesOf(Manifest.parse(base))).toEqual({});
    expect(optionalDependenciesOf(Manifest.parse(base))).toEqual({});
    expect(dependenciesOf(Manifest.parse({ ...base, dependencies: null }))).toEqual({});
  });

  it('refuses the pre-v2 array form rather than reading it as empty', () => {
    expect(() => Manifest.parse({ ...base, dependencies: ['tv.kroma.y'] })).toThrow();
  });

  it('does not read the pre-rename spelling', () => {
    // `dependsOn` was renamed, not aliased: a manifest that still uses it
    // declares nothing, which the schema validation at publish catches.
    const stale = Manifest.parse({ ...base, dependsOn: { 'tv.kroma.y': '^1.0.0' } });
    expect(dependenciesOf(stale)).toEqual({});
  });
});
