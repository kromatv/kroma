import { describe, expect, it } from 'vitest';
import type { Graph } from './graph';
import { verify } from './verify';

function graph(overrides: Partial<Graph> = {}): Graph {
  const server = {
    name: 'server',
    dir: 'server',
    manifest: 'server/Cargo.toml',
    version: '0.1.38',
    deps: [],
  };
  return {
    server,
    projects: [
      server,
      {
        name: 'tv.kroma.torrents',
        dir: 'modules/tv.kroma.torrents',
        manifest: 'modules/tv.kroma.torrents/module.json',
        version: '0.1.7',
        deps: [],
        serverRange: '>=0.1.4',
      },
      {
        name: 'tv.kroma.acquisition',
        dir: 'modules/tv.kroma.acquisition',
        manifest: 'modules/tv.kroma.acquisition/module.json',
        version: '0.1.8',
        deps: ['tv.kroma.torrents'],
        ranges: { 'tv.kroma.torrents': '^0.1.0' },
        serverRange: '>=0.1.4',
      },
    ],
    ...overrides,
  };
}

describe('verify', () => {
  it('passes a coherent graph', () => {
    expect(verify(graph())).toEqual([]);
  });

  it('flags a dependency version outside the declared range', () => {
    const g = graph();
    const torrents = g.projects.find((p) => p.name === 'tv.kroma.torrents');
    if (torrents) torrents.version = '0.2.0'; // jumps a minor; ^0.1.0 no longer holds
    const violations = verify(g);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ project: 'tv.kroma.acquisition', kind: 'range' });
  });

  it('flags a missing dependency', () => {
    const g = graph();
    const acquisition = g.projects.find((p) => p.name === 'tv.kroma.acquisition');
    if (acquisition) acquisition.ranges = { 'tv.kroma.ghost': '^0.1.0' };
    expect(verify(g)[0]).toMatchObject({ kind: 'missing-dep' });
  });

  it('flags a server below a module engine range', () => {
    const g = graph({
      server: {
        name: 'server',
        dir: 'server',
        manifest: 'server/Cargo.toml',
        version: '0.1.2',
        deps: [],
      },
    });
    expect(verify(g).some((v) => v.kind === 'min-server')).toBe(true);
  });
});
