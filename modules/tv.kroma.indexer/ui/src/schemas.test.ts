import { describe, expect, it } from 'vitest';
import {
  IndexerDefinitionDetailView,
  IndexerDefinitionsView,
  IndexersView,
  IndexerTestResult,
  IndexerView,
  SaveIndexerBody,
  SyncDefinitionsResult,
} from './schemas';

const indexer = {
  id: 'i1',
  name: 'Tracker',
  url: 'https://tracker.example/api',
  hasApiKey: true,
  categories: [2000, 2040],
  enabled: true,
  priority: 5,
  kind: 'torznab',
  definitionId: null,
  configuredSettings: ['username'],
  lastOkAt: 1700000000,
  lastError: null,
  createdAt: 1,
};

describe('IndexersView', () => {
  it('parses a configured indexer without ever carrying its key', () => {
    const view = IndexersView.parse({ indexers: [{ ...indexer, apiKey: 'secret' }] });
    expect(view.indexers[0]).not.toHaveProperty('apiKey');
    expect(view.indexers[0]?.hasApiKey).toBe(true);
    expect(view.indexers[0]?.categories).toEqual([2000, 2040]);
  });

  it('keeps a built-in indexer tied to the definition it runs', () => {
    const builtin = IndexerView.parse({
      ...indexer,
      kind: 'builtin',
      definitionId: 'sometracker',
      lastOkAt: null,
      lastError: 'login failed',
    });
    expect(builtin.definitionId).toBe('sometracker');
    expect(builtin.lastError).toBe('login failed');
  });

  it('rejects categories written as strings', () => {
    expect(() => IndexerView.parse({ ...indexer, categories: ['2000'] })).toThrow();
  });
});

describe('SaveIndexerBody', () => {
  it('treats the built-in-only fields as optional so a torznab patch stays small', () => {
    const body = SaveIndexerBody.parse({
      name: 'Renamed',
      url: null,
      apiKey: null,
      categories: null,
      enabled: null,
      priority: null,
    });
    expect(body.name).toBe('Renamed');
    expect(body.kind).toBeUndefined();
    expect(body.settings).toBeUndefined();
  });

  it('takes a definition settings map for a built-in indexer', () => {
    const body = SaveIndexerBody.parse({
      name: null,
      url: null,
      apiKey: null,
      categories: null,
      enabled: null,
      priority: null,
      kind: 'builtin',
      definitionId: 'sometracker',
      settings: { username: 'alice' },
    });
    expect(body.settings).toEqual({ username: 'alice' });
  });

  it('rejects a settings map whose values are not strings', () => {
    expect(() =>
      SaveIndexerBody.parse({
        name: null,
        url: null,
        apiKey: null,
        categories: null,
        enabled: null,
        priority: null,
        settings: { port: 8080 },
      }),
    ).toThrow();
  });
});

describe('definitions and probes', () => {
  it('parses the browse list and one definition with its settings schema', () => {
    const list = IndexerDefinitionsView.parse({
      definitions: [
        { id: 'sometracker', name: 'SomeTracker', kind: 'private', description: '', links: [] },
      ],
      synced: true,
    });
    expect(list.definitions[0]?.kind).toBe('private');

    const detail = IndexerDefinitionDetailView.parse({
      id: 'sometracker',
      name: 'SomeTracker',
      kind: 'private',
      description: 'A tracker',
      links: ['https://tracker.example/'],
      settings: [
        {
          name: 'sort',
          kind: 'select',
          label: 'Sort',
          default: 'seeders',
          options: [
            ['seeders', 'Seeders'],
            ['added', 'Added'],
          ],
        },
      ],
    });
    expect(detail.settings[0]?.options).toEqual([
      ['seeders', 'Seeders'],
      ['added', 'Added'],
    ]);
  });

  it('rejects an option that is not a (value, label) pair', () => {
    expect(() =>
      IndexerDefinitionDetailView.parse({
        id: 'x',
        name: 'X',
        kind: 'public',
        description: '',
        links: [],
        settings: [{ name: 's', kind: 'select', label: 'S', default: null, options: [['only']] }],
      }),
    ).toThrow();
  });

  it('reads a capability probe and a definitions sync', () => {
    const probe = IndexerTestResult.parse({
      ok: true,
      latencyMs: 120,
      serverTitle: 'Jackett',
      supportsTmdb: true,
      error: null,
    });
    expect(probe.serverTitle).toBe('Jackett');

    expect(SyncDefinitionsResult.parse({ count: 512, version: 'v11' })).toEqual({
      count: 512,
      version: 'v11',
    });
  });
});
