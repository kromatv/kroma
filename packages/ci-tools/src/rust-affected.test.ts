import { describe, expect, it } from 'vitest';
import { affected, type Graph, reachesEvery, shards, workspaceOf } from './rust-affected';

const graph: Graph = {
  server: [],
  lib: ['tv.kroma.scene'],
  'tv.kroma.scene': ['server'],
  'tv.kroma.torrents': ['server', 'lib', 'tv.kroma.scene'],
  'tv.kroma.vpn': ['server'],
};

describe('workspaceOf', () => {
  it('places a file in the workspace whose build reads it', () => {
    expect(workspaceOf('server/crates/kroma-db/src/lib.rs')).toBe('server');
    expect(workspaceOf('packages/core/src/locales/fr/admin.json')).toBe('server');
    expect(workspaceOf('modules/tv.kroma.vpn/server/src/lib.rs')).toBe('tv.kroma.vpn');
    expect(workspaceOf('modules/lib/naming/src/lib.rs')).toBe('lib');
  });

  it('sends the toolchain and the CI tools to every workspace, and docs to none', () => {
    expect(reachesEvery('rust-toolchain.toml')).toBe(true);
    expect(reachesEvery('packages/ci-tools/src/rust.ts')).toBe(true);
    expect(reachesEvery('server/src/main.rs')).toBe(false);
    expect(workspaceOf('docs/ci.md')).toBeNull();
  });
});

describe('affected', () => {
  it('runs every workspace for a server change, since every module links its crates', () => {
    expect(affected(['server/src/main.rs'], graph)).toEqual(Object.keys(graph));
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
  it('gives the server its own job and groups the modules', () => {
    expect(shards(['server', 'a', 'b', 'c'], 2)).toEqual([
      { name: 'server', workspaces: ['server'] },
      { name: 'modules 1', workspaces: ['a', 'b'] },
      { name: 'modules 2', workspaces: ['c'] },
    ]);
  });

  it('has no server job when the server is not affected', () => {
    expect(shards(['a'])).toEqual([{ name: 'modules 1', workspaces: ['a'] }]);
  });
});
