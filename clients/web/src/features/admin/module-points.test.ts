import { describe, expect, it } from 'vitest';
import type { AdminModule } from '#web/features/admin/module-api';
import { type Point, pointGraph } from '#web/features/admin/module-points';

function first(points: readonly Point[]): Point {
  const found = points[0];
  if (!found) throw new Error('expected at least one point');
  return found;
}

function mod(over: Partial<AdminModule> & { id: string }): AdminModule {
  return {
    schemaVersion: 2,
    name: over.id,
    version: '1.0.0',
    enabled: true,
    configValues: {},
    removable: true,
    running: true,
    hasSidecar: true,
    ...over,
  } as AdminModule;
}

describe('pointGraph', () => {
  it('lists a point with its answer and its caller', () => {
    const graph = pointGraph([
      mod({ id: 'engine', contributes: [{ point: 'download-client', id: 'qbittorrent' }] }),
      mod({ id: 'manager', consumes: [{ point: 'download-client' }] }),
    ]);

    expect(graph).toHaveLength(1);
    expect(first(graph).name).toBe('download-client');
    expect(first(graph).answers).toEqual([
      { moduleId: 'engine', name: 'engine', instance: 'qbittorrent', live: true },
    ]);
    expect(first(graph).callers).toEqual([{ moduleId: 'manager', name: 'manager' }]);
    expect(first(graph).unanswered).toBe(false);
  });

  it('sorts points by name so the list does not reshuffle between renders', () => {
    const graph = pointGraph([
      mod({
        id: 'm',
        definesPoints: [{ name: 'vpn-proxy' }, { name: 'download-db' }, { name: 'torznab' }],
      }),
    ]);

    expect(graph.map((p) => p.name)).toEqual(['m/download-db', 'm/torznab', 'm/vpn-proxy']);
  });

  it('counts an answer with no instance, for a point that takes one', () => {
    const graph = pointGraph([mod({ id: 'indexer', contributes: [{ point: 'indexer/search' }] })]);

    expect(first(graph).answers).toEqual([{ moduleId: 'indexer', name: 'indexer', live: true }]);
  });

  // A point shows even with its definer absent: something here answers or calls
  // it, and an operator looking at the graph needs to see that.
  it('names the definer and its major when the defining module is installed', () => {
    const graph = pointGraph([
      mod({ id: 'tv.kroma.torrents', definesPoints: [{ name: 'download-client', version: 2 }] }),
      mod({
        id: 'q',
        contributes: [{ point: 'tv.kroma.torrents/download-client', id: 'qbittorrent' }],
      }),
    ]);

    expect(first(graph).name).toBe('tv.kroma.torrents/download-client');
    expect(first(graph).definedBy).toBe('tv.kroma.torrents');
    expect(first(graph).version).toBe(2);
    expect(first(graph).answers.map((a) => a.instance)).toEqual(['qbittorrent']);
  });

  it('shows a point whose definer is not installed', () => {
    const graph = pointGraph([
      mod({ id: 'q', contributes: [{ point: 'tv.kroma.absent/download-client', id: 'q' }] }),
    ]);

    expect(first(graph).definedBy).toBeUndefined();
    expect(first(graph).version).toBeUndefined();
  });

  it('reports a point nothing answers as unanswered', () => {
    const graph = pointGraph([mod({ id: 'manager', consumes: [{ point: 'download-client' }] })]);

    expect(first(graph).unanswered).toBe(true);
    expect(first(graph).answers).toEqual([]);
  });

  it('does not count a disabled answer as live', () => {
    const graph = pointGraph([
      mod({ id: 'engine', enabled: false, contributes: [{ point: 'dc', id: 'q' }] }),
      mod({ id: 'manager', consumes: [{ point: 'dc' }] }),
    ]);

    expect(first(graph).unanswered).toBe(true);
    expect(first(graph).answers.map((a) => a.live)).toEqual([false]);
  });

  it('does not count a stopped answer as live', () => {
    const graph = pointGraph([
      mod({ id: 'engine', running: false, contributes: [{ point: 'dc', id: 'q' }] }),
      mod({ id: 'manager', consumes: [{ point: 'dc' }] }),
    ]);

    expect(first(graph).unanswered).toBe(true);
  });

  it('counts a library module as live even though it never runs', () => {
    const graph = pointGraph([
      mod({
        id: 'scene',
        hasSidecar: false,
        running: false,
        contributes: [{ point: 'p', id: 'a' }],
      }),
      mod({ id: 'consumer', consumes: [{ point: 'p' }] }),
    ]);

    expect(first(graph).answers.map((a) => a.live)).toEqual([true]);
    expect(first(graph).unanswered).toBe(false);
  });

  it('answers a caller that named an instance only with that instance', () => {
    const graph = pointGraph([
      mod({ id: 'transmission', contributes: [{ point: 'dc', id: 'transmission' }] }),
      mod({ id: 'manager', consumes: [{ point: 'dc', id: 'qbittorrent' }] }),
    ]);

    expect(first(graph).unanswered).toBe(true);
    expect(first(graph).callers.map((c) => c.instance)).toEqual(['qbittorrent']);
  });

  it('is not unanswered when nobody calls it', () => {
    const graph = pointGraph([mod({ id: 'engine', contributes: [{ point: 'dc', id: 'q' }] })]);

    expect(first(graph).callers).toEqual([]);
    expect(first(graph).unanswered).toBe(false);
  });

  it('gathers two answers to one point', () => {
    const graph = pointGraph([
      mod({ id: 'q', contributes: [{ point: 'dc', id: 'qbittorrent' }] }),
      mod({ id: 't', contributes: [{ point: 'dc', id: 'transmission' }] }),
    ]);

    expect(first(graph).answers.map((a) => a.instance)).toEqual(['qbittorrent', 'transmission']);
  });

  it('is empty for a module that neither answers nor calls anything', () => {
    expect(pointGraph([mod({ id: 'leaf' })])).toEqual([]);
  });
});
