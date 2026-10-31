import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cargoNotices, linkedCrates, type Metadata } from './cargo-notices';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

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

const graph = (crates: readonly string[], home = '/cargo'): Metadata => ({
  packages: [
    pkg('app', null),
    ...crates.map((id) => ({ ...pkg(id), manifest_path: join(home, id, 'Cargo.toml') })),
  ],
  resolve: {
    root: 'app',
    nodes: [
      { id: 'app', deps: crates.map((id) => dep(id, null)) },
      ...crates.map((id) => ({ id, deps: [] })),
    ],
  },
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
    const crates = linkedCrates([graph(['serde', 'zip']), graph(['serde', 'nix'])]);

    expect(crates.map((crate) => crate.name)).toEqual(['serde', 'zip', 'nix']);
  });
});

describe('cargoNotices', () => {
  const cargo = vi.mocked(execFileSync);

  beforeEach(() => {
    cargo.mockReset();
  });

  it('reads one graph per target and lists a crate two of them link once, with its license', () => {
    const home = mkdtempSync(join(tmpdir(), 'cargo-notices-'));
    for (const id of ['serde', 'zip']) {
      mkdirSync(join(home, id));
      writeFileSync(join(home, id, 'LICENSE'), `${id} license`);
    }
    cargo
      .mockReturnValueOnce(JSON.stringify(graph(['serde', 'zip'], home)))
      .mockReturnValueOnce(JSON.stringify(graph(['serde'], home)));

    const notices = cargoNotices('/app/Cargo.toml', [
      'x86_64-pc-windows-msvc',
      'aarch64-apple-darwin',
    ]);

    expect(notices.map((notice) => [notice.name, notice.texts])).toEqual([
      ['serde', ['serde license']],
      ['zip', ['zip license']],
    ]);
    expect(cargo.mock.calls.map(([, args]) => args?.slice(-2))).toEqual([
      ['--filter-platform', 'x86_64-pc-windows-msvc'],
      ['--filter-platform', 'aarch64-apple-darwin'],
    ]);
  });

  it('reads the whole graph once, unfiltered, when no target is named', () => {
    cargo.mockReturnValueOnce(JSON.stringify(graph([])));

    const notices = cargoNotices('/app/Cargo.toml');

    expect(notices).toEqual([]);
    expect(cargo).toHaveBeenCalledTimes(1);
    expect(cargo.mock.calls[0]?.[1]).not.toContain('--filter-platform');
  });
});
