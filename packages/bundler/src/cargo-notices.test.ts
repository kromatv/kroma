import { describe, expect, it } from 'vitest';
import { linkedCrates, type Metadata } from './cargo-notices';

const pkg = (
  id: string,
  source: string | null = 'registry+https://github.com/rust-lang/crates.io-index',
) => ({
  id,
  name: id,
  version: '1.0.0',
  license: 'MIT',
  repository: null,
  manifest_path: `/cargo/${id}/Cargo.toml`,
  source,
});

const dep = (pkg: string, ...kinds: (string | null)[]) => ({
  pkg,
  dep_kinds: kinds.map((kind) => ({ kind })),
});

describe('linkedCrates', () => {
  it('follows normal dependencies only, and leaves the workspace out', () => {
    const metadata: Metadata = {
      packages: [
        pkg('app', null),
        pkg('serde'),
        pkg('serde_derive'),
        pkg('cc'),
        pkg('mockall'),
        pkg('libc'),
      ],
      resolve: {
        root: 'app',
        nodes: [
          { id: 'app', deps: [dep('serde', null), dep('cc', 'build'), dep('mockall', 'dev')] },
          { id: 'serde', deps: [dep('serde_derive', null), dep('libc', 'build', null)] },
          { id: 'cc', deps: [] },
          { id: 'mockall', deps: [] },
          { id: 'serde_derive', deps: [] },
          { id: 'libc', deps: [] },
        ],
      },
    };

    expect(linkedCrates([metadata]).map((crate) => crate.name)).toEqual([
      'serde',
      'serde_derive',
      'libc',
    ]);
  });

  it('lists nothing for a manifest with no root', () => {
    const metadata: Metadata = { packages: [pkg('serde')], resolve: { root: null, nodes: [] } };

    expect(linkedCrates([metadata])).toEqual([]);
  });

  it('lists each crate once across the graphs of several targets', () => {
    const graph = (...crates: string[]): Metadata => ({
      packages: [pkg('app', null), ...crates.map((id) => pkg(id))],
      resolve: {
        root: 'app',
        nodes: [
          { id: 'app', deps: crates.map((id) => dep(id, null)) },
          ...crates.map((id) => ({ id, deps: [] })),
        ],
      },
    });

    const crates = linkedCrates([graph('serde', 'zip'), graph('serde', 'nix')]);

    expect(crates.map((crate) => crate.name)).toEqual(['serde', 'zip', 'nix']);
  });
});
