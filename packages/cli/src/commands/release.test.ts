import { describe, expect, it } from 'vitest';
import type { Catalog, Entry } from '../bundle/catalog';
import type { Bundle } from '../bundle/read';
import { decide, tagFor, verdictFor } from './release';

const REPO = 'kromatv/kroma';
const NOW = '2026-08-14T00:00:00.000Z';

const download = (id: string, version: string, file: string) =>
  `https://github.com/${REPO}/releases/download/${tagFor(id, version)}/${file}`;

function entry(id: string, version: string, contentHash: string): Entry {
  const file = `${id}.kmod`;
  const url = download(id, version, file);
  const sha256 = `zstd-${contentHash}`;
  return {
    id,
    name: id,
    version,
    artifacts: [{ file, url, size: 1, sha256, contentHash }],
    file,
    url,
    size: 1,
    sha256,
  };
}

function perPlatform(id: string, version: string, hashes: Record<string, string>): Entry {
  const artifacts = Object.entries(hashes).map(([target, contentHash]) => ({
    target,
    file: `${id}-${target}.kmod`,
    url: download(id, version, `${id}-${target}.kmod`),
    size: 1,
    sha256: `zstd-${contentHash}`,
    contentHash,
  }));
  const [first] = artifacts;
  if (!first) throw new Error('an entry needs at least one artifact');
  const { file, url, size, sha256 } = first;
  return { id, name: id, version, artifacts, file, url, size, sha256 };
}

function bundle(id: string, version: string, contentHash: string): Bundle {
  return {
    manifest: { id, name: id, version },
    file: `${id}.kmod`,
    path: `/dist/modules/${id}.kmod`,
    size: 1,
    sha256: `zstd-${contentHash}`,
    contentHash,
  };
}

const catalog = (...modules: Entry[]): Catalog => ({ schema: 2, modules });

const cutUnder = (e: Entry, owner: string): Entry => ({
  ...e,
  url: e.url.replace(REPO, owner),
  artifacts: e.artifacts.map((a) => ({ ...a, url: a.url.replace(REPO, owner) })),
});

describe('tagFor', () => {
  it('cuts a module its own tag, id and version joined', () => {
    expect(tagFor('tv.kroma.indexer', '0.1.3')).toBe('tv.kroma.indexer@0.1.3');
  });
});

describe('verdictFor', () => {
  it('publishes a module nothing knows about yet', () => {
    expect(verdictFor(entry('a', '0.1.0', 'h1'), undefined)).toEqual({ kind: 'new' });
  });

  it('publishes a bumped version', () => {
    const v = verdictFor(entry('a', '0.1.3', 'h2'), entry('a', '0.1.2', 'h1'));

    expect(v).toEqual({ kind: 'publish', from: '0.1.2' });
  });

  it('skips a module whose bytes are identical', () => {
    const v = verdictFor(entry('a', '0.1.2', 'h1'), entry('a', '0.1.2', 'h1'));

    expect(v).toEqual({ kind: 'unchanged' });
  });

  it('refuses to republish a version whose bytes moved', () => {
    const v = verdictFor(entry('a', '0.1.2', 'FIXED'), entry('a', '0.1.2', 'h1'));

    expect(v).toEqual({ kind: 'stale', published: '0.1.2' });
  });

  it('reads a component at the version a per-platform release already has as moved', () => {
    const live = perPlatform('a', '0.1.2', { musl: 'h1', darwin: 'h2' });

    const v = verdictFor(entry('a', '0.1.2', 'component'), live);

    expect(v).toEqual({ kind: 'stale', published: '0.1.2' });
  });

  it('refuses a version that went backwards', () => {
    const v = verdictFor(entry('a', '0.1.1', 'h1'), entry('a', '0.2.0', 'h9'));

    expect(v).toEqual({ kind: 'backwards', published: '0.2.0' });
  });

  it('accepts a published entry from before content hashes existed', () => {
    const live = entry('a', '0.1.2', 'h1');
    for (const a of live.artifacts) {
      (a as { contentHash?: string }).contentHash = undefined;
    }

    const v = verdictFor(entry('a', '0.1.2', 'whatever'), live);

    expect(v).toEqual({ kind: 'unchanged' });
  });
});

describe('decide', () => {
  it('points a published module at its own tag, one bundle and its checksum', () => {
    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.indexer', '0.1.3', 'new')],
      catalog(entry('tv.kroma.indexer', '0.1.2', 'old')),
      REPO,
      NOW,
    );

    expect(plan.publish).toEqual([
      {
        id: 'tv.kroma.indexer',
        version: '0.1.3',
        tag: 'tv.kroma.indexer@0.1.3',
        files: ['tv.kroma.indexer.kmod', 'tv.kroma.indexer.kmod.sha256'],
        reason: 'publish',
      },
    ]);
    expect(out.modules[0]?.artifacts).toHaveLength(1);
    expect(out.modules[0]?.artifacts[0]?.url).toContain(
      '/releases/download/tv.kroma.indexer@0.1.3/tv.kroma.indexer.kmod',
    );
  });

  it('carries an unchanged module forward at its OWN older tag', () => {
    const live = entry('tv.kroma.mdns', '0.1.0', 'same');

    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.mdns', '0.1.0', 'same')],
      catalog(live),
      REPO,
      NOW,
    );

    expect(plan.publish).toEqual([]);
    expect(plan.unchanged).toEqual(['tv.kroma.mdns']);
    expect(out.modules[0]?.artifacts[0]?.url).toBe(live.artifacts[0]?.url);
  });

  it('warns (not errors) when bytes changed without a bump, naming the module', () => {
    const { errors, stale, plan } = decide(
      [bundle('tv.kroma.indexer', '0.1.2', 'FIXED')],
      catalog(entry('tv.kroma.indexer', '0.1.2', 'old')),
      REPO,
      NOW,
    );

    expect(plan.publish).toEqual([]);
    expect(errors).toEqual([]);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('tv.kroma.indexer');
    expect(stale[0]).toContain("the module's version past");
  });

  it('publishes the ready module and only warns on the stale one', () => {
    const { errors, stale, plan } = decide(
      [bundle('tv.kroma.indexer', '0.1.3', 'new'), bundle('tv.kroma.whisper', '0.1.1', 'FIXED')],
      catalog(entry('tv.kroma.indexer', '0.1.2', 'old'), entry('tv.kroma.whisper', '0.1.1', 'w')),
      REPO,
      NOW,
    );

    expect(plan.publish.map((r) => r.id)).toEqual(['tv.kroma.indexer']);
    expect(errors).toEqual([]);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('tv.kroma.whisper');
  });

  it('carries stale modules forward at their live tag while others publish', () => {
    const live = entry('tv.kroma.whisper', '0.1.1', 'w');

    const { catalog: out } = decide(
      [bundle('tv.kroma.indexer', '0.1.3', 'new'), bundle('tv.kroma.whisper', '0.1.1', 'FIXED')],
      catalog(entry('tv.kroma.indexer', '0.1.2', 'old'), live),
      REPO,
      NOW,
    );

    const whisper = out.modules.find((m) => m.id === 'tv.kroma.whisper');
    expect(whisper?.artifacts[0]?.url).toBe(live.artifacts[0]?.url);
  });

  it('reports every stale module when all of them are unbumped', () => {
    const { errors, stale, plan } = decide(
      [bundle('tv.kroma.indexer', '0.1.2', 'FIXED'), bundle('tv.kroma.whisper', '0.1.1', 'FIXED')],
      catalog(entry('tv.kroma.indexer', '0.1.2', 'old'), entry('tv.kroma.whisper', '0.1.1', 'w')),
      REPO,
      NOW,
    );

    expect(plan.publish).toEqual([]);
    expect(errors).toEqual([]);
    expect(stale).toHaveLength(2);
  });

  it('keeps a module that this run did not build', () => {
    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.indexer', '0.1.3', 'new')],
      catalog(entry('tv.kroma.indexer', '0.1.2', 'old'), entry('tv.kroma.whisper', '0.1.1', 'w')),
      REPO,
      NOW,
    );

    expect(plan.carried).toEqual(['tv.kroma.whisper']);
    expect(out.modules.map((m) => m.id)).toEqual(['tv.kroma.indexer', 'tv.kroma.whisper']);
  });

  it('carries a module published per platform forward with every platform it names', () => {
    const live = perPlatform('tv.kroma.whisper', '0.1.1', { musl: 'w', darwin: 'd' });

    const { catalog: out } = decide([], catalog(live), REPO, NOW);

    expect(out.modules[0]?.artifacts.map((a) => a.target)).toEqual(['musl', 'darwin']);
  });

  it('rejects a version it cannot order', () => {
    const { errors } = decide([bundle('a', 'latest', 'h')], catalog(), REPO, NOW);

    expect(errors[0]).toContain('not semver');
  });

  it('is byte-identical for the same inputs', () => {
    const bundles = [bundle('b', '1.0.0', 'x'), bundle('a', '1.0.0', 'y')];

    const one = decide(bundles, catalog(), REPO, NOW);
    const two = decide([...bundles].reverse(), catalog(), REPO, NOW);

    expect(JSON.stringify(one.catalog)).toBe(JSON.stringify(two.catalog));
  });

  it('moves a carried entry onto the repository the catalog is published from', () => {
    const live = cutUnder(entry('tv.kroma.whisper', '0.2.0', 'w'), 'someone/kroma');

    const { plan, catalog: out } = decide([], catalog(live), REPO, NOW);

    expect(plan.carried).toEqual(['tv.kroma.whisper']);
    expect(out.modules[0]?.url).toContain(`github.com/${REPO}/releases/download/`);
    expect(JSON.stringify(out.modules)).not.toContain('someone/kroma');
  });

  it('moves an unchanged module’s published entry onto the current repository', () => {
    const live = cutUnder(entry('tv.kroma.indexer', '0.1.0', 'a'), 'someone/kroma');

    const { plan, catalog: out } = decide(
      [bundle('tv.kroma.indexer', '0.1.0', 'a')],
      catalog(live),
      REPO,
      NOW,
    );

    expect(plan.unchanged).toEqual(['tv.kroma.indexer']);
    expect(out.modules[0]?.artifacts[0]?.url).toContain(`github.com/${REPO}/releases/download/`);
  });

  it('leaves a download URL that is not a GitHub release alone', () => {
    const live = entry('tv.kroma.whisper', '0.2.0', 'w');
    live.url = 'https://cdn.example.com/whisper.kmod';
    live.artifacts = live.artifacts.map((a) => ({
      ...a,
      url: 'https://cdn.example.com/whisper.kmod',
    }));

    const { catalog: out } = decide([], catalog(live), REPO, NOW);

    expect(out.modules[0]?.url).toBe('https://cdn.example.com/whisper.kmod');
  });
});
