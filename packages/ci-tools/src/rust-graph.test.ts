import { describe, expect, it } from 'vitest';
import { affected } from './rust-affected';
import { dependencyGraph } from './rust-graph';

const graph = dependencyGraph();

describe('dependencyGraph', () => {
  it('reads a server crate inherited workspace dependencies as edges', () => {
    expect(graph['server:kroma-db']).toContain('server:kroma-domain');
  });

  it('links a module to the server crates its manifest names by path', () => {
    expect(graph['tv.kroma.vpn']).toContain('server:kroma-module-sdk');
  });

  it('reaches no module from the engine, which only the server links', () => {
    const hit = affected(['server/crates/kroma-engine/src/lib.rs'], graph);

    expect(hit.filter((id) => !id.startsWith('server'))).toEqual([]);
  });

  it('reaches every module from the crates the module SDK is built on', () => {
    const hit = affected(['server/crates/kroma-module-wire/src/lib.rs'], graph);
    const modules = Object.keys(graph).filter((id) => !id.startsWith('server'));

    expect(hit).toEqual(expect.arrayContaining(modules));
  });
});
