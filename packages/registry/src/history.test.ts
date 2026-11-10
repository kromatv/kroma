import { describe, expect, it } from 'vitest';
import { buildModuleRecord } from './build.ts';
import { ModuleRecord } from './documents/index.ts';
import { foldHistory, HISTORY_SCHEMA, VersionHistory } from './history.ts';
import type { DescribedModule } from './manifest/index.ts';

const NOW = '2026-11-10T12:00:00.000Z';

function entry(id: string, version: string, server = '>=0.1.38'): DescribedModule {
  return {
    schemaVersion: 3,
    id,
    name: id,
    version,
    engines: { server },
    artifacts: [{ url: `https://h/${id}@${version}.kmod`, size: 10, sha256: 'ab'.repeat(32) }],
  } as DescribedModule;
}

describe('foldHistory', () => {
  it('starts a history from the first catalog it sees', () => {
    const history = foldHistory(null, [entry('tv.acme.notes', '0.1.0')], NOW);

    expect(history).toMatchObject({
      schema: HISTORY_SCHEMA,
      generatedAt: NOW,
      modules: { 'tv.acme.notes': { '0.1.0': { engines: { server: '>=0.1.38' } } } },
    });
  });

  it('keeps every earlier version when a newer one is published', () => {
    const first = foldHistory(null, [entry('tv.acme.notes', '0.1.0')], NOW);

    const second = foldHistory(first, [entry('tv.acme.notes', '0.2.0', '>=0.1.39')], NOW);

    expect(Object.keys(second.modules['tv.acme.notes'] ?? {})).toEqual(['0.2.0', '0.1.0']);
    expect(second.modules['tv.acme.notes']?.['0.1.0']?.engines).toEqual({ server: '>=0.1.38' });
  });

  it('never rewrites a version it already holds', () => {
    const first = foldHistory(null, [entry('tv.acme.notes', '0.1.0')], NOW);

    const again = foldHistory(first, [entry('tv.acme.notes', '0.1.0', '>=9.9.9')], NOW);

    expect(again.modules['tv.acme.notes']?.['0.1.0']?.engines).toEqual({ server: '>=0.1.38' });
  });

  it('keeps a module the catalog no longer names', () => {
    const first = foldHistory(null, [entry('tv.acme.gone', '1.0.0')], NOW);

    const next = foldHistory(first, [entry('tv.acme.notes', '0.1.0')], NOW);

    expect(Object.keys(next.modules)).toEqual(['tv.acme.gone', 'tv.acme.notes']);
  });

  it('orders versions newest first by semver, not by text', () => {
    const history = foldHistory(
      null,
      ['0.2.0', '0.10.0', '0.9.1'].map((v) => entry('tv.acme.notes', v)),
      NOW,
    );

    expect(Object.keys(history.modules['tv.acme.notes'] ?? {})).toEqual([
      '0.10.0',
      '0.9.1',
      '0.2.0',
    ]);
  });

  it('writes a document its own schema reads back', () => {
    const history = foldHistory(null, [entry('tv.acme.notes', '0.1.0')], NOW);

    expect(VersionHistory.parse(JSON.parse(JSON.stringify(history)))).toEqual(history);
  });

  it('gives a module record the full description of every version it holds', () => {
    const history = foldHistory(
      null,
      [entry('tv.acme.notes', '0.1.0'), entry('tv.acme.notes', '0.2.0', '>=0.1.39')],
      NOW,
    );

    const record = buildModuleRecord(entry('tv.acme.notes', '0.2.0', '>=0.1.39'), {
      versions: history.modules['tv.acme.notes'],
    });

    expect(ModuleRecord.parse(record).versions['0.1.0']).toMatchObject({
      schemaVersion: 3,
      engines: { server: '>=0.1.38' },
      artifacts: [{ url: 'https://h/tv.acme.notes@0.1.0.kmod' }],
    });
  });
});
