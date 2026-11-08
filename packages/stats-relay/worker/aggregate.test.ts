import { describe, expect, it } from 'vitest';
import {
  ACTIVE_DAYS,
  aggregate,
  counted,
  ranked,
  REPORTING_DAYS,
  SETTLE_DAYS,
  SIZE_REPORTERS,
} from './aggregate';
import { row } from './test-support';

const DAY = 86_400;
const NOW = 1_800_000_000;
const SOME = 5;

function settled(overrides: Parameters<typeof row>[0] = {}) {
  return row({ firstSeen: NOW - 30 * DAY, lastSeen: NOW - DAY, ...overrides });
}

const fleet = (n: number, overrides: Parameters<typeof row>[0] = {}, prefix = 'id') =>
  Array.from({ length: n }, (_, i) => settled({ id: `${prefix}-${i}`, ...overrides }));

describe('counted', () => {
  it('leaves out an install that has not been heard from in a month', () => {
    const rows = [
      settled({ id: 'live' }),
      settled({ id: 'gone', lastSeen: NOW - (ACTIVE_DAYS + 1) * DAY }),
    ];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['live']);
  });

  it('leaves out an install younger than the settling window', () => {
    const rows = [
      settled({ id: 'old' }),
      settled({ id: 'new', firstSeen: NOW - (SETTLE_DAYS - 1) * DAY }),
    ];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['old']);
  });

  it('leaves out an install that went quiet before it had reported for the settling window', () => {
    const rows = [
      settled({ id: 'kept' }),
      settled({ id: 'once', firstSeen: NOW - 10 * DAY, lastSeen: NOW - 10 * DAY }),
      settled({
        id: 'a-few-days',
        firstSeen: NOW - 20 * DAY,
        lastSeen: NOW - (20 - SETTLE_DAYS + 1) * DAY,
      }),
    ];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['kept']);
  });

  it('counts an install whose reports span the settling window however few they are', () => {
    const rows = [settled({ id: 'weekly', firstSeen: NOW - SETTLE_DAYS * DAY, lastSeen: NOW })];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['weekly']);
  });

  it('publishes how many installs in their first week are still reporting', () => {
    const rows = [
      settled({ id: 'counted' }),
      settled({ id: 'new', firstSeen: NOW - 3 * DAY, lastSeen: NOW - DAY }),
      settled({ id: 'today', firstSeen: NOW, lastSeen: NOW }),
      settled({
        id: 'trial',
        firstSeen: NOW - (REPORTING_DAYS + 1) * DAY,
        lastSeen: NOW - (REPORTING_DAYS + 1) * DAY,
      }),
      settled({ id: 'fleet', firstSeen: NOW - DAY, lastSeen: NOW, flagged: true }),
    ];

    const result = aggregate(rows, [], NOW);

    expect(result.instances).toBe(1);
    expect(result.settling).toBe(2);
  });

  it('leaves out a row the nightly sweep flagged', () => {
    const rows = [settled({ id: 'real' }), settled({ id: 'fleet', flagged: true })];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['real']);
  });
});

describe('ranked', () => {
  it('orders by weight, then by name', () => {
    const counts = new Map([
      ['b', 2],
      ['a', 2],
      ['c', 3],
    ]);

    expect(ranked(counts).map((c) => c.key)).toEqual(['c', 'a', 'b']);
  });

  it('keeps a key that looks like a number where its count puts it', () => {
    const counts = new Map([
      ['2', 1],
      ['1.4.2', 4],
    ]);

    expect(ranked(counts).map((c) => c.key)).toEqual(['1.4.2', '2']);
  });

  it('counts a key that names something on Object.prototype', () => {
    expect(ranked(new Map([['constructor', 1]]))).toEqual([{ key: 'constructor', n: 1 }]);
  });
});

describe('aggregate', () => {
  it('counts installs and adds up the devices they serve', () => {
    const result = aggregate(fleet(SOME), [], NOW);

    expect(result.instances).toBe(SOME);
    expect(result.clients).toEqual({
      tv: SOME,
      mobile: 2 * SOME,
      desktop: 0,
      total: 3 * SOME,
    });
  });

  it('reports the operating system rather than the full build triple', () => {
    const rows = [
      ...fleet(SOME, { target: 'x86_64-unknown-linux-musl' }, 'linux'),
      ...fleet(SOME, { target: 'aarch64-apple-darwin' }, 'mac'),
      ...fleet(SOME, { target: 'x86_64-pc-windows-msvc' }, 'win'),
    ];

    const result = aggregate(rows, [], NOW);

    expect(result.platforms).toEqual([
      { key: 'darwin', n: SOME },
      { key: 'linux-musl', n: SOME },
      { key: 'windows-msvc', n: SOME },
    ]);
  });

  it('keeps a target it cannot take apart as it came', () => {
    const result = aggregate(fleet(SOME, { target: 'wasm32' }), [], NOW);

    expect(result.platforms).toEqual([{ key: 'wasm32', n: SOME }]);
  });

  it('publishes every breakdown from its first server', () => {
    const lone = settled({ id: 'nas', country: 'NZ', install: 'synology', version: '9.9.9' });

    const result = aggregate([...fleet(SOME, { country: 'CH' }), lone], [], NOW);

    expect(result.countries).toEqual([
      { key: 'CH', n: SOME },
      { key: 'NZ', n: 1 },
    ]);
    expect(result.installs).toEqual([
      { key: 'docker', n: SOME },
      { key: 'synology', n: 1 },
    ]);
    expect(result.versions).toEqual([
      { key: '1.4.2', n: SOME },
      { key: '9.9.9', n: 1 },
    ]);
  });

  it('counts a language and a module once per install that has it', () => {
    const rows = fleet(SOME, { locales: ['de-de', 'de-de'], modules: ['tv.kroma.vpn'] });

    const result = aggregate(rows, [], NOW);

    expect(result.locales).toEqual([{ key: 'de-de', n: SOME }]);
    expect(result.modules).toEqual([{ key: 'tv.kroma.vpn', n: SOME }]);
  });

  it('counts the countries the fleet is spread over', () => {
    const rows = [
      settled({ id: 'a', country: 'CH' }),
      settled({ id: 'b', country: 'CH' }),
      settled({ id: 'c', country: 'NZ' }),
      settled({ id: 'd', country: null }),
    ];

    const result = aggregate(rows, [], NOW);

    expect(result.located).toEqual({ servers: 3, countries: 2 });
  });

  it('adds up accounts and titles once two installs report a size', () => {
    const result = aggregate(fleet(SIZE_REPORTERS, { users: 3, titles: 1240 }), [], NOW);

    expect(result.sizes).toEqual({ users: 3 * SIZE_REPORTERS, titles: 1240 * SIZE_REPORTERS });
    expect(result.reports.sizes).toBe(SIZE_REPORTERS);
  });

  it('publishes no size while a single install is the only one reporting one', () => {
    const banded = settled({ id: 'banded', users: undefined, titles: undefined });

    const result = aggregate([settled({ id: 'sized' }), banded], [], NOW);

    expect(result.instances).toBe(2);
    expect(result.reports.sizes).toBe(1);
    expect(result.sizes).toBeNull();
  });

  it('bands the builds of the servers that report one, over how many do', () => {
    const rows = [
      settled({ id: 'source', build: 0 }),
      settled({ id: 'older-shape' }),
      settled({ id: 'gone', build: 0, lastSeen: NOW - (ACTIVE_DAYS + 1) * DAY }),
    ];

    const result = aggregate(rows, [], NOW);

    expect(result.builds).toEqual([{ key: 'source', n: 1 }]);
    expect(result.reports.builds).toBe(1);
  });

  it('passes the recorded history through and stamps when it answered', () => {
    const history = [{ day: '2026-08-25', instances: 3, clients: 9, users: 4, titles: 120 }];

    const result = aggregate([], history, NOW);

    expect(result.history).toEqual(history);
    expect(result.updatedAt).toBe(NOW);
  });
});
