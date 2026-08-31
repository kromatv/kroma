import { describe, expect, it } from 'vitest';
import { type Commit, churn, components, hosts, rerenders, type Work } from './analyse';

const work = (mounted: number, updated: number): Work => ({ mounted, updated });

const commit = (fields: Partial<Commit>): Commit => ({
  touched: 0,
  work: {},
  census: {},
  hosts: {},
  deleted: {},
  ms: 0,
  ...fields,
});

describe('the components that did work', () => {
  it('reads nothing out of no commits', () => {
    expect(components([])).toEqual([]);
  });

  it('sums a component across every commit it appears in', () => {
    const commits = [commit({ work: { Row: work(3, 0) } }), commit({ work: { Row: work(0, 4) } })];

    expect(components(commits)).toEqual([['Row', { mounted: 3, updated: 4 }]]);
  });

  it('ranks one remount above nine re-renders, because it costs more', () => {
    const commits = [commit({ work: { Rail: work(0, 9), Tile: work(1, 0) } })];

    expect(components(commits).map(([name]) => name)).toEqual(['Tile', 'Rail']);
  });
});

describe('the components destroyed while the screen still needed them', () => {
  it('reads nothing out of a mount with nothing after it', () => {
    expect(churn([commit({ census: { Tile: 4 } })])).toEqual([]);
  });

  it('reads nothing out of no commits at all', () => {
    expect(churn([])).toEqual([]);
  });

  it('names a component deleted and still on screen afterwards', () => {
    const commits = [
      commit({ census: { Tile: 4 } }),
      commit({ deleted: { Tile: 4 }, census: { Tile: 4 } }),
    ];

    expect(churn(commits)).toEqual([['Tile', 4]]);
  });

  it('leaves a menu that was closed alone, since nothing rebuilt it', () => {
    const commits = [
      commit({ census: { Menu: 1, Tile: 4 } }),
      commit({ deleted: { Menu: 1 }, census: { Tile: 4 } }),
    ];

    expect(churn(commits)).toEqual([]);
  });

  it('adds up deletions across every commit after the mount, worst first', () => {
    const commits = [
      commit({ census: { Tile: 1, Row: 1 } }),
      commit({ deleted: { Tile: 1, Row: 3 }, census: { Tile: 1, Row: 1 } }),
      commit({ deleted: { Tile: 5 }, census: { Tile: 1, Row: 1 } }),
    ];

    expect(churn(commits)).toEqual([
      ['Tile', 6],
      ['Row', 3],
    ]);
  });
});

describe('the fibers that ran again', () => {
  it('does not count the mount, which is the first commit', () => {
    expect(rerenders([commit({ work: { Row: work(0, 7) } })])).toBe(0);
  });

  it('counts updates and ignores mounts, across every later commit', () => {
    const commits = [
      commit({}),
      commit({ work: { Row: work(2, 3), Tile: work(0, 4) } }),
      commit({ work: { Row: work(0, 1) } }),
    ];

    expect(rerenders(commits)).toBe(8);
  });
});

describe('the host elements on screen once everything settled', () => {
  it('reads nothing out of no commits', () => {
    expect(hosts([])).toEqual([]);
  });

  it('reads the last commit, not the sum, and orders by count', () => {
    const commits = [
      commit({ hosts: { div: 90, span: 1 } }),
      commit({ hosts: { div: 3, span: 7 } }),
    ];

    expect(hosts(commits)).toEqual([
      ['span', 7],
      ['div', 3],
    ]);
  });
});
