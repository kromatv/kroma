// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { type CommandUsage, readCommandUsage, recordCommandUse, usageBoost } from './command-usage';

const VIEWER = 'viewer';
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const used = (uses: number, ago: number, queries: Record<string, number> = {}): CommandUsage => ({
  row: { uses, last: NOW - ago, queries },
});

beforeEach(() => {
  localStorage.clear();
});

describe('recordCommandUse', () => {
  it('counts a row each time it is chosen', () => {
    recordCommandUse(VIEWER, 'row', '', NOW);
    recordCommandUse(VIEWER, 'row', '', NOW);

    expect(readCommandUsage(VIEWER).row?.uses).toBe(2);
  });

  it('remembers what was typed, whatever its case or padding', () => {
    recordCommandUse(VIEWER, 'row', '  RES ', NOW);
    recordCommandUse(VIEWER, 'row', 'res', NOW);

    expect(readCommandUsage(VIEWER).row?.queries).toEqual({ res: 2 });
  });

  it('remembers no query when nothing was typed', () => {
    recordCommandUse(VIEWER, 'row', '', NOW);

    expect(readCommandUsage(VIEWER).row?.queries).toEqual({});
  });

  it('keeps each profile’s habits to itself on a shared device', () => {
    recordCommandUse('first', 'row', 'res', NOW);

    expect(readCommandUsage('second')).toEqual({});
  });

  it('keeps a bounded number of queries for one row, the strongest', () => {
    recordCommandUse(VIEWER, 'row', 'often', NOW);
    recordCommandUse(VIEWER, 'row', 'often', NOW);
    for (const query of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9']) {
      recordCommandUse(VIEWER, 'row', query, NOW);
    }

    const queries = readCommandUsage(VIEWER).row?.queries ?? {};

    expect(Object.keys(queries)).toHaveLength(8);
    expect(queries.often).toBe(2);
  });

  it('keeps a bounded number of rows, the latest', () => {
    for (let at = 0; at < 130; at += 1) recordCommandUse(VIEWER, `row${at}`, '', NOW + at);

    const usage = readCommandUsage(VIEWER);

    expect(Object.keys(usage)).toHaveLength(120);
    expect(usage.row129).toBeDefined();
    expect(usage.row0).toBeUndefined();
  });
});

describe('readCommandUsage', () => {
  it('reads nothing from a value it did not write', () => {
    localStorage.setItem(`kroma:command-menu:usage:${VIEWER}`, '{not json');

    expect(readCommandUsage(VIEWER)).toEqual({});
  });

  it('reads nothing from a value of the wrong shape', () => {
    localStorage.setItem(`kroma:command-menu:usage:${VIEWER}`, '{"row":{"uses":"many"}}');

    expect(readCommandUsage(VIEWER)).toEqual({});
  });
});

describe('usageBoost', () => {
  it('gives nothing to a row never chosen', () => {
    expect(usageBoost({}, 'row', 're', NOW)).toBe(0);
  });

  it('gives more to a row used more', () => {
    expect(usageBoost(used(9, 0), 'row', 're', NOW)).toBeGreaterThan(
      usageBoost(used(1, 0), 'row', 're', NOW),
    );
  });

  it('gives more to a row used more lately', () => {
    expect(usageBoost(used(5, 0), 'row', 're', NOW)).toBeGreaterThan(
      usageBoost(used(5, 60 * DAY), 'row', 're', NOW),
    );
  });

  it('lifts a row chosen before after typing the same thing', () => {
    expect(usageBoost(used(1, 0, { res: 1 }), 'row', 'res', NOW)).toBeGreaterThan(
      usageBoost(used(1, 0), 'row', 'res', NOW) + 40,
    );
  });

  it('lifts it for a shorter query, so it rises as less is typed', () => {
    const boost = usageBoost(used(1, 0, { reseau: 1 }), 'row', 're', NOW);

    expect(boost).toBeGreaterThan(usageBoost(used(1, 0), 'row', 're', NOW));
  });

  it('lifts it more the closer the query is to what was typed', () => {
    const usage = used(1, 0, { reseau: 1 });

    expect(usageBoost(usage, 'row', 'resea', NOW)).toBeGreaterThan(
      usageBoost(usage, 'row', 're', NOW),
    );
  });

  it('does not lift it for a query that has nothing to do with what was typed', () => {
    expect(usageBoost(used(1, 0, { reseau: 1 }), 'row', 'film', NOW)).toBe(
      usageBoost(used(1, 0), 'row', 'film', NOW),
    );
  });

  it('never lifts a row past a hit on the whole text', () => {
    const everything = used(1000, 0, { films: 1000 });

    expect(usageBoost(everything, 'row', 'films', NOW)).toBeLessThan(320);
  });
});
