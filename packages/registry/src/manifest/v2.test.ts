import { describe, expect, it } from 'vitest';
import { dependenciesOf, Manifest, optionalDependenciesOf } from './v2.ts';

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

  it('carries a provider entry whole, admin UI metadata included', () => {
    const parsed = Manifest.parse({
      ...base,
      provides: [{ kind: 'download-client', id: 'qbittorrent', label: 'qBittorrent', fields: [] }],
    });
    // Stripping these would silently break the "add engine" picker.
    expect(parsed.provides?.[0]).toMatchObject({ label: 'qBittorrent', fields: [] });
  });

  it('refuses a capability that is not one', () => {
    expect(() => Manifest.parse({ ...base, provides: [{ id: 'no-kind' }] })).toThrow();
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
    provides: [{ kind: 'download-client', id: 'rqbit', label: 'rqbit' }],
    requires: [{ kind: 'indexer-engine' }],
    ports: ['download-grab', 'download-db'],
    permissions: ['library.manage'],
    config: [{ key: 'host', label: 'Host', type: 'string', placeholder: 'localhost' }],
    feRemote: { module: './Module' },
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
