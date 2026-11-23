import { describe, expect, it } from 'vitest';
import { affected, type Graph, nodesOf, reach, reachesEvery, shards } from './rust-affected';

const graph: Graph = {
  server: ['server:kroma-engine', 'server:kroma-module-sdk'],
  'server:kroma-domain': [],
  'server:kroma-engine': ['server:kroma-domain'],
  'server:kroma-module-sdk': ['server:kroma-domain'],
  'server:kroma-wasm-host': [],
  'server:kroma-wasm-test-runner': ['server:kroma-wasm-host'],
  'server:kroma-module-audit': ['server:kroma-wasm-host', 'server:kroma-module-sdk'],
  lib: ['tv.kroma.scene'],
  'tv.kroma.scene': ['server:kroma-module-sdk'],
  'tv.kroma.torrents': ['server:kroma-module-sdk', 'lib', 'tv.kroma.scene'],
  'tv.kroma.vpn': ['server:kroma-module-sdk'],
};

const MODULES = ['lib', 'tv.kroma.scene', 'tv.kroma.torrents', 'tv.kroma.vpn'];

describe('nodesOf', () => {
  it('places a file in the crate or workspace whose build reads it', () => {
    expect(nodesOf('server/crates/kroma-domain/src/lib.rs', graph)).toEqual([
      'server:kroma-domain',
    ]);
    expect(nodesOf('server/src/main.rs', graph)).toEqual(['server']);
    expect(nodesOf('packages/core/src/locales/fr/admin.json', graph)).toEqual([
      'server:kroma-engine',
    ]);
    expect(nodesOf('modules/tv.kroma.vpn/server/src/lib.rs', graph)).toEqual(['tv.kroma.vpn']);
    expect(nodesOf('modules/lib/naming/src/lib.rs', graph)).toEqual(['lib']);
    expect(nodesOf('docs/ci.md', graph)).toEqual([]);
  });

  it('gives the server manifest to every crate, and its lockfile to the binaries it builds', () => {
    expect(nodesOf('server/Cargo.toml', graph)).toHaveLength(7);
    expect(nodesOf('server/Cargo.lock', graph)).toEqual([
      'server',
      'server:kroma-wasm-test-runner',
      'server:kroma-module-audit',
    ]);
  });

  it('sends the toolchain and the CI tools to every workspace', () => {
    expect(reachesEvery('rust-toolchain.toml')).toBe(true);
    expect(reachesEvery('packages/ci-tools/src/rust.ts')).toBe(true);
    expect(reachesEvery('server/src/main.rs')).toBe(false);
  });
});

describe('affected', () => {
  it('runs no module for a change to a crate no module links', () => {
    expect(affected(['server/crates/kroma-engine/src/lib.rs'], graph)).toEqual([
      'server',
      'server:kroma-engine',
    ]);
  });

  it('runs every module that links a crate that changed, through the crates between', () => {
    expect(affected(['server/crates/kroma-domain/src/lib.rs'], graph)).toEqual(
      Object.keys(graph).filter((id) => !id.includes('wasm')),
    );
  });

  it('runs one module alone when nothing links it', () => {
    expect(affected(['modules/tv.kroma.vpn/server/src/lib.rs'], graph)).toEqual(['tv.kroma.vpn']);
  });

  it('follows the links to every workspace that depends on what changed', () => {
    expect(affected(['modules/tv.kroma.scene/server/src/lib.rs'], graph)).toEqual([
      'lib',
      'tv.kroma.scene',
      'tv.kroma.torrents',
    ]);
  });

  it('runs everything when the files cannot be listed or the toolchain moved', () => {
    expect(affected('all', graph)).toEqual(Object.keys(graph));
    expect(affected(['rust-toolchain.toml'], graph)).toEqual(Object.keys(graph));
  });

  it('runs nothing for a change no Rust build reads', () => {
    expect(affected(['docs/ci.md'], graph)).toEqual([]);
  });
});

describe('shards', () => {
  it('gives the server its lint, its tests and its component tests apart, and every module one job', () => {
    expect(shards(['server', 'a', 'b', 'c'])).toEqual([
      { name: 'server', workspaces: ['server'], part: 'core' },
      { name: 'module host', workspaces: ['server'], part: 'host' },
      { name: 'server clippy', workspaces: ['server'], part: 'clippy' },
      { name: 'modules', workspaces: ['a', 'b', 'c'] },
    ]);
  });

  it('has no server job when the server is not affected, and no module job without a module', () => {
    expect(shards(['a'])).toEqual([{ name: 'modules', workspaces: ['a'] }]);
    expect(shards(['server']).map((shard) => shard.name)).not.toContain('modules');
  });
});

describe('reach', () => {
  it('keeps the server jobs alone for a change only the server builds', () => {
    const jobs = reach(affected(['server/src/main.rs'], graph), graph);

    expect(jobs.shards.map((shard) => shard.name)).toEqual([
      'server',
      'module host',
      'server clippy',
    ]);
    expect(jobs.components).toEqual([]);
    expect(jobs.audit).toEqual([]);
  });

  it('runs every module as a component when the test runner moved, and through the audit when its host did', () => {
    const jobs = reach(affected(['server/crates/kroma-wasm-host/src/lib.rs'], graph), graph);

    expect(jobs.shards.map((shard) => shard.name)).not.toContain('modules');
    expect(jobs.components).toEqual(MODULES);
    expect(jobs.audit).toEqual(MODULES);
  });

  it('gives the module jobs the modules a module change reaches', () => {
    const jobs = reach(affected(['modules/tv.kroma.vpn/server/src/lib.rs'], graph), graph);

    expect(jobs.shards).toEqual([{ name: 'modules', workspaces: ['tv.kroma.vpn'] }]);
    expect(jobs.components).toEqual(['tv.kroma.vpn']);
    expect(jobs.audit).toEqual(['tv.kroma.vpn']);
  });
});
