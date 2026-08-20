import { describe, expect, it } from 'vitest';
import { Catalog } from './catalog.ts';
import { catalogDay, ordered, toSiteCatalog } from './modules.ts';

// Through the real schema, so a fixture the published catalog could not produce
// fails here rather than passing on a shape only this test believes in.
const raw = (modules: unknown[], generatedAt?: string | null) =>
  Catalog.parse({ generatedAt, modules });

describe('toSiteCatalog', () => {
  it('reduces an entry to the facts the site renders', () => {
    const { modules } = toSiteCatalog(
      raw([
        {
          id: 'tv.kroma.torrents',
          name: 'Torrent downloads',
          version: '0.1.7',
          description: 'The engine',
          icon: 'data:image/svg+xml;base64,AAA',
          contributes: [{ point: 'tv.kroma.torrents/client', id: 'rqbit' }],
          consumes: [],
          dependencies: { 'tv.kroma.indexer': '^0.1.0' },
        },
      ]),
    );

    expect(modules[0]).toEqual({
      id: 'tv.kroma.torrents',
      name: 'Torrent downloads',
      version: '0.1.7',
      description: 'The engine',
      icon: 'data:image/svg+xml;base64,AAA',
      library: false,
      answers: ['client'],
      needs: [],
      dependencies: ['tv.kroma.indexer'],
    });
  });

  it('lists the ids a module depends on', () => {
    const { modules } = toSiteCatalog(raw([{ id: 'a', dependencies: { x: '^1', y: '*' } }]));
    expect(modules[0]?.dependencies).toEqual(['x', 'y']);
  });

  it('falls back to the id when a name is missing, and never returns undefined fields', () => {
    const { modules } = toSiteCatalog(raw([{ id: 'tv.kroma.mystery' }]));
    expect(modules[0]).toMatchObject({
      name: 'tv.kroma.mystery',
      version: '',
      description: null,
      icon: null,
      library: false,
      answers: [],
      needs: [],
      dependencies: [],
    });
  });

  it('marks a library module, which runs no process of its own', () => {
    const { modules } = toSiteCatalog(raw([{ id: 'tv.kroma.scene', library: true }]));
    expect(modules[0]?.library).toBe(true);
  });

  it('de-duplicates two contributions to one point', () => {
    const { modules } = toSiteCatalog(
      raw([
        {
          id: 'a',
          contributes: [
            { point: 'tv.kroma.indexer/engine', id: 'torznab' },
            { point: 'tv.kroma.indexer/engine', id: 'newznab' },
          ],
        },
      ]),
    );
    expect(modules[0]?.answers).toEqual(['engine']);
  });

  it('carries a missing generatedAt through as null rather than undefined', () => {
    expect(toSiteCatalog(raw([])).generatedAt).toBeNull();
  });
});

describe('ordered', () => {
  it('puts what stands on its own before what builds on it', () => {
    const { modules } = toSiteCatalog(
      raw([
        {
          id: 'tv.kroma.acquisition',
          name: 'Acquisition',
          consumes: [{ point: 'tv.kroma.indexer/engine' }, { point: 'tv.kroma.torrents/client' }],
        },
        {
          id: 'tv.kroma.torrents',
          name: 'Torrent downloads',
          dependencies: { 'tv.kroma.indexer': '^0.1.0' },
        },
        { id: 'tv.kroma.indexer', name: 'Indexers' },
      ]),
    );

    expect(ordered(modules).map((x) => x.name)).toEqual([
      'Indexers',
      'Torrent downloads',
      'Acquisition',
    ]);
  });

  it('sorts by name within a tier, so the order does not depend on catalog order', () => {
    const { modules } = toSiteCatalog(
      raw([
        { id: 'b.zz', name: 'Zeta' },
        { id: 'a.aa', name: 'Alpha' },
      ]),
    );
    expect(ordered(modules).map((x) => x.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('keeps a module the site has never heard of, since it knows no ids', () => {
    const { modules } = toSiteCatalog(raw([{ id: 'tv.kroma.brandnew', name: 'Brand new' }]));
    expect(ordered(modules).map((x) => x.id)).toEqual(['tv.kroma.brandnew']);
  });

  it('does not mutate its input', () => {
    const { modules } = toSiteCatalog(
      raw([
        { id: 'b', name: 'B' },
        { id: 'a', name: 'A' },
      ]),
    );
    const before = modules.map((x) => x.id);
    ordered(modules);
    expect(modules.map((x) => x.id)).toEqual(before);
  });
});

describe('catalogDay', () => {
  it('keeps the day and drops the clock', () => {
    expect(catalogDay('2026-08-15T13:19:46.343Z')).toBe('2026-08-15');
  });

  it('answers null for an absent or unparseable stamp', () => {
    expect(catalogDay(null)).toBeNull();
    expect(catalogDay('last tuesday')).toBeNull();
  });
});
