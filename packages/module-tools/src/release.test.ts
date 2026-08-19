import { describe, expect, it } from 'vitest';
import type { Bundle } from './bundles';
import type { Catalog, Entry } from './catalog';
import { decide, tagFor, verdictFor } from './release';

const REPO = 'maxscharwath/kroma';
const NOW = '2026-08-14T00:00:00.000Z';

function entry(id: string, version: string, hashes: Record<string, string>): Entry {
  const artifacts = Object.entries(hashes).map(([target, contentHash]) => ({
    target,
    file: `${id}-${target}.kmod`,
    url: `https://github.com/${REPO}/releases/download/${tagFor(id, version)}/${id}-${target}.kmod`,
    size: 1,
    sha256: `zstd-${contentHash}`,
    contentHash,
  }));
  const first = artifacts[0];
  if (!first) throw new Error('an entry needs at least one artifact');
  return {
    id,
    name: id,
    version,
    artifacts,
    file: first.file,
    url: first.url,
    size: first.size,
    sha256: first.sha256,
  };
}

function bundle(id: string, version: string, target: string, contentHash: string): Bundle {
  return {
    manifest: { id, name: id, version },
    target,
    file: `${id}-${target}.kmod`,
    path: `/dist/modules/${id}-${target}.kmod`,
    size: 1,
    sha256: `zstd-${contentHash}`,
    contentHash,
  };
}

const catalog = (...modules: Entry[]): Catalog => ({ schema: 2, modules });

describe('verdictFor', () => {
  it('publishes a module nothing knows about yet', () => {
    expect(verdictFor(entry('a', '0.1.0', { musl: 'h1' }), undefined)).toEqual({ kind: 'new' });
  });

  it('publishes a bumped version', () => {
    const v = verdictFor(entry('a', '0.1.3', { musl: 'h2' }), entry('a', '0.1.2', { musl: 'h1' }));
    expect(v).toEqual({ kind: 'publish', from: '0.1.2' });
  });

  it('skips a module whose bytes are identical', () => {
    const v = verdictFor(
      entry('a', '0.1.2', { musl: 'h1', darwin: 'h2' }),
      entry('a', '0.1.2', { musl: 'h1', darwin: 'h2' }),
    );
    expect(v).toEqual({ kind: 'unchanged' });
  });

  it('refuses to republish a version whose bytes moved', () => {
    // The bug this whole command exists for: same version, new binary. The Store
    // compares versions, so it would report "up to date" forever.
    const v = verdictFor(
      entry('a', '0.1.2', { musl: 'FIXED', darwin: 'h2' }),
      entry('a', '0.1.2', { musl: 'h1', darwin: 'h2' }),
    );
    expect(v).toEqual({ kind: 'stale', published: '0.1.2', targets: ['musl'] });
  });

  it('refuses a version that went backwards', () => {
    const v = verdictFor(entry('a', '0.1.1', { musl: 'h1' }), entry('a', '0.2.0', { musl: 'h9' }));
    expect(v).toEqual({ kind: 'backwards', published: '0.2.0' });
  });

  it('judges a target the run did not build as saying nothing', () => {
    // A `targets: modules` run that packs only musl must not read as "darwin is
    // unchanged" - nor as a change. Only shared targets are compared.
    const v = verdictFor(
      entry('a', '0.1.2', { musl: 'h1' }),
      entry('a', '0.1.2', { musl: 'h1', darwin: 'h2' }),
    );
    expect(v).toEqual({ kind: 'unchanged' });
  });

  it('accepts a published entry from before content hashes existed', () => {
    // Schema-2 catalogs already in the wild carry no contentHash. Demanding a
    // bump against a hash nobody recorded would block the first release after
    // this change for every module at once.
    const live = entry('a', '0.1.2', { musl: 'h1' });
    for (const a of live.artifacts) {
      (a as { contentHash?: string }).contentHash = undefined;
    }
    expect(verdictFor(entry('a', '0.1.2', { musl: 'whatever' }), live)).toEqual({
      kind: 'unchanged',
    });
  });
});

describe('decide', () => {
  it('points a published module at its own tag', () => {
    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.indexer', '0.1.3', 'x86_64-unknown-linux-musl', 'new')],
      catalog(entry('tv.kroma.indexer', '0.1.2', { 'x86_64-unknown-linux-musl': 'old' })),
      REPO,
      NOW,
    );
    expect(plan.publish).toEqual([
      {
        id: 'tv.kroma.indexer',
        version: '0.1.3',
        tag: 'tv.kroma.indexer@0.1.3',
        files: [
          'tv.kroma.indexer-x86_64-unknown-linux-musl.kmod',
          'tv.kroma.indexer-x86_64-unknown-linux-musl.kmod.sha256',
        ],
        reason: 'publish',
      },
    ]);
    expect(out.modules[0]?.artifacts[0]?.url).toContain(
      '/releases/download/tv.kroma.indexer@0.1.3/',
    );
  });

  it('carries an unchanged module forward at its OWN older tag', () => {
    // The whole point of an independent train: republishing the catalog must not
    // move an untouched module's download URL to a tag that does not hold it.
    const live = entry('tv.kroma.mdns', '0.1.0', { musl: 'same' });
    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.mdns', '0.1.0', 'musl', 'same')],
      catalog(live),
      REPO,
      NOW,
    );
    expect(plan.publish).toEqual([]);
    expect(plan.unchanged).toEqual(['tv.kroma.mdns']);
    expect(out.modules[0]?.artifacts[0]?.url).toBe(live.artifacts[0]?.url);
  });

  it('fails the run, naming the module, when bytes changed without a bump', () => {
    const { errors, plan } = decide(
      [bundle('tv.kroma.indexer', '0.1.2', 'musl', 'FIXED')],
      catalog(entry('tv.kroma.indexer', '0.1.2', { musl: 'old' })),
      REPO,
      NOW,
    );
    expect(plan.publish).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tv.kroma.indexer');
    expect(errors[0]).toContain('modules/tv.kroma.indexer/module.json');
  });

  it('keeps a module that this run did not build', () => {
    // `targets: modules` scoping, or a module whose build leg failed: dropping it
    // would uninstall it from every Store that reads the catalog.
    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.indexer', '0.1.3', 'musl', 'new')],
      catalog(
        entry('tv.kroma.indexer', '0.1.2', { musl: 'old' }),
        entry('tv.kroma.whisper', '0.1.1', { musl: 'w' }),
      ),
      REPO,
      NOW,
    );
    expect(plan.carried).toEqual(['tv.kroma.whisper']);
    expect(out.modules.map((m) => m.id)).toEqual(['tv.kroma.indexer', 'tv.kroma.whisper']);
  });

  it('groups a module’s targets into one entry and one tag', () => {
    const { plan, catalog: out } = decide(
      [
        bundle('tv.kroma.remote', '0.1.2', 'aarch64-apple-darwin', 'mac'),
        bundle('tv.kroma.remote', '0.1.2', 'x86_64-unknown-linux-musl', 'musl'),
      ],
      catalog(),
      REPO,
      NOW,
    );
    expect(plan.publish).toHaveLength(1);
    expect(plan.publish[0]?.files).toHaveLength(4);
    expect(out.modules[0]?.artifacts.map((a) => a.target)).toEqual([
      'aarch64-apple-darwin',
      'x86_64-unknown-linux-musl',
    ]);
  });

  it('rejects a version it cannot order', () => {
    const { errors } = decide([bundle('a', 'latest', 'musl', 'h')], catalog(), REPO, NOW);
    expect(errors[0]).toContain('not semver');
  });

  it('is byte-identical for the same inputs', () => {
    const bundles = [bundle('b', '1.0.0', 'musl', 'x'), bundle('a', '1.0.0', 'musl', 'y')];
    const one = decide(bundles, catalog(), REPO, NOW);
    const two = decide([...bundles].reverse(), catalog(), REPO, NOW);
    expect(JSON.stringify(one.catalog)).toBe(JSON.stringify(two.catalog));
  });
});
