import { describe, expect, it } from 'vitest';
import { affected, directlyChanged } from './affected';
import type { Graph } from './graph';

const graph: Graph = {
  projects: [
    { name: 'server', dir: 'server', manifest: 'server/Cargo.toml', version: '0.1.38', deps: [] },
    {
      name: 'ui',
      dir: 'packages/ui',
      manifest: 'packages/ui/package.json',
      version: '0.1.0',
      deps: [],
    },
    {
      name: 'tizen',
      dir: 'clients/tizen',
      manifest: 'clients/tizen/package.json',
      version: '0.1.0',
      deps: ['ui'],
    },
    {
      name: 'webos',
      dir: 'clients/webos',
      manifest: 'clients/webos/package.json',
      version: '0.1.0',
      deps: ['ui'],
    },
  ],
};

describe('directlyChanged', () => {
  it('maps a path to the deepest owning project', () => {
    expect([...directlyChanged(['clients/tizen/src/app.ts'], graph)]).toEqual(['tizen']);
  });

  it('ignores paths outside every project', () => {
    expect([...directlyChanged(['README.md', 'docs/x.md'], graph)]).toEqual([]);
  });
});

describe('affected', () => {
  it('includes transitive dependents (a ui change rebuilds the clients)', () => {
    expect([...affected(['packages/ui/src/button.tsx'], graph)].sort()).toEqual([
      'tizen',
      'ui',
      'webos',
    ]);
  });

  it('a leaf change affects only itself', () => {
    expect([...affected(['server/src/main.rs'], graph)]).toEqual(['server']);
  });

  it('a client change does not drag its siblings', () => {
    expect([...affected(['clients/tizen/src/app.ts'], graph)]).toEqual(['tizen']);
  });

  it('terminates on a dependency cycle', () => {
    const cyclic: Graph = {
      projects: [
        {
          name: 'a',
          dir: 'packages/a',
          manifest: 'packages/a/package.json',
          version: '1.0.0',
          deps: ['b'],
        },
        {
          name: 'b',
          dir: 'packages/b',
          manifest: 'packages/b/package.json',
          version: '1.0.0',
          deps: ['a'],
        },
      ],
    };
    expect([...affected(['packages/a/x.ts'], cyclic)].sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty change set', () => {
    expect([...affected([], graph)]).toEqual([]);
  });
});
